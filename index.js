const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cron = require('node-cron');
const { handleError, userQueries, clientQueries, multaQueries, abonoQueries, statsQueries } = require('./utils/database');
const { auth } = require('./config/supabase');
const { createBackup, restoreBackup } = require('./utils/backup');
const multer = require('multer');
const path = require('path');
const passwordUtils = require('./utils/password');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Middleware de autenticación con Supabase
const authenticateJWT = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ 
            error: 'No token provided',
            message: 'Se requiere un token de autenticación'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verificar el token con Supabase Auth
        const { data: { user }, error: authError } = await auth.supabaseAdmin.auth.getUser(token);
        
        if (authError) {
            console.error('Error de autenticación:', authError);
            return res.status(401).json({ 
                error: 'Token inválido',
                message: 'El token de autenticación no es válido o ha expirado'
            });
        }

        if (!user) {
            return res.status(401).json({ 
                error: 'Usuario no encontrado',
                message: 'No se pudo encontrar el usuario asociado al token'
            });
        }

        // Obtener el rol del usuario desde la base de datos usando el cliente admin
        const { data: userData, error: dbError } = await auth.supabaseAdmin
            .from('usuarios')
            .select('id, email, role')
            .eq('email', user.email)
            .single();

        if (dbError) {
            console.error('Error obteniendo datos del usuario:', dbError);
            if (dbError.code === 'PGRST116') {
                return res.status(401).json({ 
                    error: 'Usuario no encontrado',
                    message: 'El usuario no existe en la base de datos'
                });
            }
            throw dbError;
        }

        if (!userData) {
            return res.status(401).json({ 
                error: 'Usuario no encontrado',
                message: 'El usuario no existe en la base de datos'
            });
        }

        req.user = {
            id: userData.id,
            email: user.email,
            role: userData.role
        };

        next();
    } catch (error) {
        console.error('Error en autenticación:', error);
        return res.status(401).json({ 
            error: 'Error de autenticación',
            message: 'Ocurrió un error al verificar la autenticación'
        });
    }
};

const nodemailer = require('nodemailer');

let transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

transporter.sendMail = transporter.sendMail.bind(transporter);

// Función para verificar la conexión inicial con Supabase
async function checkInitialDatabaseConnection() {
    try {
        // Verificar la conexión haciendo una consulta simple
        const { data, error } = await clientQueries.findAll();
        if (error) throw error;
        console.log('Conexión inicial a Supabase exitosa');
    } catch (error) {
        console.error('Error al verificar la conexión inicial:', error);
        throw error;
    }
}

// Rutas de autenticación
app.post('/auth/signup', async (req, res) => {
    const { email, password, nombre, role } = req.body;

    try {
        console.log('Iniciando proceso de registro para:', email);

        // Verificar si el usuario existe en la base de datos usando el cliente admin
        const { data: existingDbUser, error: dbError } = await auth.supabaseAdmin
            .from('usuarios')
            .select('id, email')
            .eq('email', email)
            .single();

        if (dbError && dbError.code !== 'PGRST116') {
            console.error('Error verificando usuario en base de datos:', dbError);
            throw dbError;
        }

        if (existingDbUser) {
            console.log('Email ya registrado en la base de datos:', email);
            return res.status(400).json({ 
                error: 'Usuario ya registrado',
                details: 'Ya existe un usuario registrado con este email'
            });
        }

        // Verificar si el usuario existe en Supabase Auth
        const { data: authUsers, error: authError } = await auth.supabaseAdmin.auth.admin.listUsers();
        
        if (authError) {
            console.error('Error verificando usuarios en Auth:', authError);
            throw authError;
        }

        const existingAuthUser = authUsers?.users?.find(user => user.email === email);
        if (existingAuthUser) {
            console.log('Email ya registrado en Auth:', email);
            return res.status(400).json({ 
                error: 'Usuario ya registrado',
                details: 'Ya existe un usuario registrado con este email'
            });
        }

        // Crear usuario en Supabase Auth
        console.log('Creando usuario en Auth...');
        const { user, error: signUpError } = await auth.signUp(email, password, { nombre, role });

        if (signUpError) {
            console.error('Error en signUp:', signUpError);
            return res.status(400).json({ 
                error: 'Error al crear usuario',
                details: signUpError.message
            });
        }

        // Hashear la contraseña antes de guardarla en la base de datos
        const hashedPassword = await passwordUtils.hashPassword(password);

        // Crear usuario en la base de datos
        console.log('Creando usuario en base de datos...');
        const userData = await userQueries.create({
            email,
            nombre,
            role,
            password: hashedPassword,
            auth_id: user.id
        });

        console.log('Usuario creado exitosamente:', userData.id);
        res.status(201).json({
            message: 'Usuario creado exitosamente',
            user: {
                id: userData.id,
                email: user.email,
                nombre: userData.nombre,
                role: userData.role
            }
        });
    } catch (error) {
        console.error('Error en registro:', error);
        handleError(error, res);
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Primero intentar el login con Supabase Auth
        const { session } = await auth.signIn(email, password);
        
        // Obtener los datos del usuario de nuestra base de datos
        const userData = await userQueries.findByEmail(email);
        
        if (!userData) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas',
                code: 'AUTH_INVALID_CREDENTIALS',
                details: {
                    type: 'auth',
                    action: 'sign_in',
                    reason: 'invalid_credentials'
                },
                message: 'Credenciales inválidas'
            });
        }

        // Verificar la contraseña hasheada
        const isValidPassword = await passwordUtils.verifyPassword(password, userData.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas',
                code: 'AUTH_INVALID_CREDENTIALS',
                details: {
                    type: 'auth',
                    action: 'sign_in',
                    reason: 'invalid_credentials'
                },
                message: 'Credenciales inválidas'
            });
        }

        res.json({
            token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user: {
                id: userData.id,
                email: userData.email,
                nombre: userData.nombre,
                role: userData.role
            }
        });
    } catch (error) {
        // Manejar específicamente los diferentes códigos de error
        switch (error.code) {
            case 'AUTH_INVALID_CREDENTIALS':
                return res.status(401).json({
                    error: 'Credenciales inválidas',
                    code: error.code,
                    details: error.details,
                    message: 'Credenciales inválidas'
                });
            case 'AUTH_INVALID_EMAIL':
                return res.status(400).json({
                    error: 'Email inválido',
                    code: error.code,
                    details: error.details,
                    message: 'El formato del email no es válido'
                });
            case 'AUTH_SIGNIN_ERROR':
                return res.status(500).json({
                    error: 'Error de autenticación',
                    code: error.code,
                    details: error.details,
                    message: 'Error al iniciar sesión'
                });
            default:
                // Para otros errores, mantener el manejo general
                handleError(error, res);
        }
    }
});

app.post('/auth/logout', authenticateJWT, async (req, res) => {
    try {
        await auth.signOut();
        res.json({ message: 'Sesión cerrada exitosamente' });
    } catch (error) {
        handleError(error, res);
    }
});

app.post('/auth/reset-password', async (req, res) => {
    const { email } = req.body;

    try {
        await auth.resetPassword(email);
        res.json({ message: 'Password reset email sent' });
    } catch (error) {
        // Manejar específicamente los diferentes códigos de error
        switch (error.code) {
            case 'AUTH_EMAIL_NOT_FOUND':
                return res.status(400).json({ 
                    error: 'Email no encontrado',
                    code: error.code,
                    details: error.details,
                    message: error.message
                });
            case 'AUTH_INVALID_EMAIL':
                return res.status(400).json({ 
                    error: 'Email inválido',
                    code: error.code,
                    details: error.details,
                    message: error.message
                });
            case 'AUTH_INVALID_REDIRECT':
                return res.status(500).json({ 
                    error: 'Error de configuración',
                    code: error.code,
                    details: error.details,
                    message: error.message
                });
            default:
                // Para otros errores, mantener el manejo general
                handleError(error, res);
        }
    }
});

app.post('/auth/update-password', async (req, res) => {
    const { newPassword, resetToken, email } = req.body;

    if (!newPassword) {
        return res.status(400).json({ 
            error: 'Contraseña requerida',
            message: 'La nueva contraseña es requerida'
        });
    }

    try {
        // Si se proporciona un token de reset, usarlo para actualizar la contraseña
        if (resetToken) {
            if (!email) {
                return res.status(400).json({
                    error: 'Email requerido',
                    message: 'Se requiere el email para actualizar la contraseña con token de reset'
                });
            }
            const { error } = await auth.updatePassword(newPassword, resetToken, email);
            if (error) throw error;
            
            return res.json({ 
                message: 'Contraseña actualizada exitosamente',
                details: 'La contraseña ha sido actualizada usando el token de recuperación'
            });
        }

        // Si no hay token de reset, verificar la sesión actual
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ 
                error: 'No autorizado',
                message: 'Se requiere una sesión activa o un token de recuperación'
            });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await auth.supabaseAdmin.auth.getUser(token);
        
        if (authError || !user) {
            return res.status(401).json({ 
                error: 'Sesión inválida',
                message: 'La sesión actual no es válida'
            });
        }

        // Actualizar la contraseña usando la sesión actual
        const { error } = await auth.updatePassword(newPassword);
        if (error) throw error;

        res.json({ 
            message: 'Contraseña actualizada exitosamente',
            details: 'La contraseña ha sido actualizada usando la sesión actual'
        });
    } catch (error) {
        console.error('Error actualizando contraseña:', error);
        
        if (error.message?.includes('Invalid token')) {
            return res.status(400).json({ 
                error: 'Token inválido',
                message: 'El token de recuperación no es válido o ha expirado'
            });
        }

        if (error.message?.includes('Password should be at least')) {
            return res.status(400).json({ 
                error: 'Contraseña inválida',
                message: 'La contraseña debe tener al menos 6 caracteres'
            });
        }

        res.status(500).json({ 
            error: 'Error actualizando contraseña',
            message: 'Ocurrió un error al intentar actualizar la contraseña'
        });
    }
});

app.get('/clientes', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const clientes = await clientQueries.findByWorkerId(req.user.id);
        res.json(clientes);
    } catch (error) {
        handleError(error, res);
    }
});

const calcularInteresTotal = (montoInicial, tasaInteres) => {
    return montoInicial * tasaInteres;
};

const calcularTotalAPagar = (montoInicial, interesTotal) => {
    return montoInicial + interesTotal;
};

const calcularPagosDiarios = (totalAPagar, dias) => {
    return totalAPagar / dias;
};

// Configurar almacenamiento de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Aceptar solo imágenes
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
            return cb(new Error('Solo se permiten archivos de imagen (jpg, jpeg, png)'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // límite de 5MB
    }
});

//!CREAR CLIENTES Y PRESTAMOS
app.post('/clientes', authenticateJWT, upload.fields([
    { name: 'comprobante_domicilio', maxCount: 1 },
    { name: 'ine', maxCount: 1 }
]), async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const {
        nombre,
        direccion,
        telefono,
        telefono_familiar,
        ocupacion,
        fecha_inicio,
        fecha_termino,
        monto_inicial,
        trabajador_id
    } = req.body;

    // Validar campos requeridos
    if (!nombre || !direccion || !telefono || !telefono_familiar || 
        !ocupacion || !fecha_inicio || !fecha_termino || !monto_inicial || 
        !trabajador_id || !req.files) {
        return res.status(400).json({ 
            error: 'Faltan campos requeridos o archivos necesarios',
            required: {
                nombre: !nombre,
                direccion: !direccion,
                telefono: !telefono,
                telefono_familiar: !telefono_familiar,
                ocupacion: !ocupacion,
                fecha_inicio: !fecha_inicio,
                fecha_termino: !fecha_termino,
                monto_inicial: !monto_inicial,
                trabajador_id: !trabajador_id,
                comprobante_domicilio: !req.files.comprobante_domicilio,
                ine: !req.files.ine
            }
        });
    }

    // Validar que se subieron ambos archivos
    if (!req.files.comprobante_domicilio || !req.files.ine) {
        return res.status(400).json({ 
            error: 'Se requieren ambos archivos: comprobante de domicilio e INE',
            missing: {
                comprobante_domicilio: !req.files.comprobante_domicilio,
                ine: !req.files.ine
            }
        });
    }

    const fechaInicio = new Date(fecha_inicio);
    const fechaTerminoSeleccionada = new Date(fecha_termino);
    const dias = Math.ceil((fechaTerminoSeleccionada - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
    const totalAPagar = monto_inicial * 1.30;
    const pagosDiarios = calcularPagosDiarios(totalAPagar, dias);

    try {
        // Subir archivos a Supabase Storage
        const comprobanteFile = req.files.comprobante_domicilio[0];
        const ineFile = req.files.ine[0];

        // Subir comprobante de domicilio
        const { data: comprobanteData, error: comprobanteError } = await auth.storage
            .from('documentos')
            .upload(`comprobantes/${comprobanteFile.filename}`, comprobanteFile.buffer, {
                contentType: comprobanteFile.mimetype
            });

        if (comprobanteError) throw comprobanteError;

        // Subir INE
        const { data: ineData, error: ineError } = await auth.storage
            .from('documentos')
            .upload(`ine/${ineFile.filename}`, ineFile.buffer, {
                contentType: ineFile.mimetype
            });

        if (ineError) throw ineError;

        const clientData = {
            nombre,
            direccion,
            telefono,
            telefono_familiar,
            ocupacion,
            fecha_inicio: fechaInicio.toISOString().split('T')[0],
            fecha_termino: fechaTerminoSeleccionada.toISOString().split('T')[0],
            multas: '0',
            monto_inicial,
            monto_actual: totalAPagar,
            estado: 'pendiente',
            trabajador_id,
            total_multas_hoy: 0,
            total_multas_semanales: 0,
            comprobante_domicilio_url: comprobanteData.path,
            ine_url: ineData.path
        };

        const newClient = await clientQueries.create(clientData);
        
        res.status(201).json({
            message: 'Cliente creado exitosamente',
            id: newClient.id,
            pagos_diarios: pagosDiarios
        });
    } catch (error) {
        console.error('Error creando cliente:', error);
        res.status(500).json({ 
            error: 'Error creando cliente',
            details: error.message 
        });
    }
});

app.get('/clientes/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const cliente = await clientQueries.findById(clienteId);

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json(cliente);
    } catch (error) {
        console.error('Error obteniendo cliente:', error);
        res.status(500).json({ error: 'Error obteniendo cliente' });
    }
});

app.put('/clientes/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;
    const { nombre, ocupacion, direccion, telefono, fecha_inicio, fecha_termino, monto_inicial, monto_actual, estado } = req.body;

    // Si el monto_actual es 0 pero no es por un pago completo, mantener el estado en "pendiente"
    let nuevoEstado = estado;
    if (monto_actual === 0 && estado !== 'completado') {
        nuevoEstado = 'pendiente';
    }

    try {
        const cliente = await clientQueries.findById(clienteId);

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const updatedClient = await clientQueries.update(clienteId, {
            nombre,
            ocupacion,
            direccion,
            telefono,
            fecha_inicio,
            fecha_termino,
            monto_inicial,
            monto_actual,
            estado: nuevoEstado
        });

        res.json({ message: 'Cliente actualizado correctamente' });
    } catch (error) {
        console.error('Error actualizando cliente:', error);
        res.status(500).json({ error: 'Error actualizando cliente' });
    }
});

app.delete('/clientes/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const cliente = await clientQueries.findById(clienteId);

        if (!cliente) {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }

        await clientQueries.delete(clienteId);
        res.json({ message: 'Cliente eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando cliente:', error);
        res.status(500).json({ error: 'Error eliminando cliente' });
    }
});

app.get('/clientes/:id/multas', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const multas = await multaQueries.findByClientId(clienteId);
        console.log(`Obtenidas ${multas.length} multas para el cliente con ID: ${clienteId}`);
        res.json(multas);
    } catch (error) {
        handleError(error, res);
    }
});

app.post('/clientes/:id/multas', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') {
        return res.sendStatus(403);
    }

    const clienteId = req.params.id;
    const { fecha } = req.body;

    if (!fecha) {
        return res.status(400).json({ error: 'Fecha es un campo requerido' });
    }

    const montoMultaFija = 20; // Multa fija de 20 pesos

    try {
        // Obtener datos del cliente
        const cliente = await clientQueries.findById(clienteId);

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const montoMulta = montoMultaFija;

        // Crear multa
        const multaData = {
            cliente_id: clienteId,
            fecha,
            monto: montoMulta,
            estado: 'pendiente'
        };

        await multaQueries.create(multaData);

        // Obtener todas las multas del cliente para contar
        const multas = await multaQueries.findByClientId(clienteId);
        const totalMultasHoy = multas.filter(m => new Date(m.fecha).toDateString() === new Date().toDateString()).length;
        const totalMultasSemanales = multas.filter(m => {
            const multaDate = new Date(m.fecha);
            const today = new Date();
            const diffTime = Math.abs(today - multaDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
        }).length;

        const nuevoMonto = parseFloat(cliente.monto_actual) + montoMulta;
        const nuevaFechaTermino = new Date(cliente.fecha_termino);

        if (totalMultasHoy % 3 === 0) {
            nuevaFechaTermino.setDate(nuevaFechaTermino.getDate() + 1);
        }

        // Actualizar cliente
        await clientQueries.update(clienteId, {
            monto_actual: nuevoMonto,
            fecha_termino: nuevaFechaTermino.toISOString().split('T')[0],
            total_multas_hoy: totalMultasHoy,
            total_multas_semanales: totalMultasSemanales
        });

        res.status(201).json({
            message: 'Multa creada y monto actualizado',
            nuevoMonto,
            nuevaFechaTermino,
            totalMultasHoy,
            totalMultasSemanales
        });
    } catch (error) {
        handleError(error, res);
    }
});

app.post('/clientes/:id/abonos', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;
    const { monto, fecha } = req.body;

    if (!monto || !fecha) {
        return res.status(400).json({ error: 'Monto y fecha son campos requeridos' });
    }

    try {
        const cliente = await clientQueries.findById(clienteId);

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        if (cliente.estado === 'completado') {
            return res.status(400).json({ error: 'No se pueden agregar más abonos, el cliente está completado' });
        }

        const nuevoMontoActual = cliente.monto_actual - parseFloat(monto);

        // Crear abono
        const [abonoResult] = await clientQueries.createAbono(clienteId, parseFloat(monto), fecha, nuevoMontoActual <= 0 ? 'completado' : cliente.estado);

        res.status(201).json({
            message: nuevoMontoActual <= 0 ? 'Abono creado y cliente completado' : 'Abono creado',
            abonoId: abonoResult.insertId
        });
    } catch (error) {
        console.error('Error procesando abono:', error);
        res.status(500).json({ error: 'Error procesando abono' });
    }
});

app.get('/clientes/:id/abonos', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const abonos = await clientQueries.findAbonosByClientId(clienteId);
        console.log(`Obtenidos ${abonos.length} abonos para el cliente con ID: ${clienteId}`);
        res.json(abonos);
    } catch (error) {
        console.error('Error obteniendo abonos:', error);
        res.status(500).json({ error: 'Error obteniendo abonos' });
    }
});

//?FUNCTION: GET ALL WORKERS
app.get('/trabajadores', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const trabajadores = await userQueries.findAllWorkers();
        res.json(trabajadores);
    } catch (error) {
        console.error('Error obteniendo datos de trabajadores:', error);
        res.status(500).json({ 
            error: 'Error obteniendo datos de trabajadores',
            message: 'Ocurrió un error al intentar obtener la lista de trabajadores'
        });
    }
});

//?FUNCTION: GET INFORMATION FOR A SPECIFIC WORKER
app.get('/trabajadores/:id/clientes', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;

    const query = `
        SELECT c.*, COUNT(m.id) AS total_multas 
        FROM clientes c 
        LEFT JOIN multas m ON c.id = m.cliente_id 
        WHERE c.trabajador_id = ? 
        GROUP BY c.id`;

    try {
        const clientes = await clientQueries.findByWorkerId(trabajadorId);

        console.log(`Obtenidos ${clientes.length} clientes para el trabajador con ID: ${trabajadorId}`);
        res.json(clientes);
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({ error: 'Error obteniendo clientes' });
    }
});

//?FUNCTION: CREATE A NEW WORKER
app.post('/trabajadores', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { nombre, email, password, role } = req.body;

    if (!nombre || !email || !password || !role) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    try {
        const trabajador = await userQueries.createWorker(nombre, email, password, role);
        res.status(201).json({ message: 'Trabajador creado', id: trabajador.id });
    } catch (error) {
        console.error('Error creando trabajador:', error);
        res.status(500).json({ error: 'Error creando trabajador' });
    }
});

//?FUNCTION: UPDATE WORKER
app.put('/trabajadores/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;
    const { nombre, email, role } = req.body;

    if (!nombre || !email || !role) {
        return res.status(400).json({ 
            error: 'Campos requeridos',
            message: 'Todos los campos (nombre, email, role) son requeridos'
        });
    }

    try {
        const trabajador = await userQueries.updateWorker(trabajadorId, nombre, email, role);
        res.status(200).json({ 
            message: 'Trabajador actualizado exitosamente',
            trabajador: {
                id: trabajador.id,
                nombre: trabajador.nombre,
                email: trabajador.email,
                role: trabajador.role
            }
        });
    } catch (error) {
        console.error('Error actualizando trabajador:', error);
        
        if (error.message === 'Trabajador no encontrado') {
            return res.status(404).json({ 
                error: 'Trabajador no encontrado',
                message: 'No existe un trabajador con el ID proporcionado'
            });
        }
        
        if (error.message === 'El email ya está registrado por otro usuario') {
            return res.status(400).json({ 
                error: 'Email duplicado',
                message: 'El email ya está registrado por otro usuario'
            });
        }

        if (error.message.includes('Error actualizando el email en la autenticación') ||
            error.message.includes('No se pudo actualizar la información de autenticación')) {
            return res.status(500).json({ 
                error: 'Error de autenticación',
                message: 'No se pudo actualizar la información en el sistema de autenticación'
            });
        }

        res.status(500).json({ 
            error: 'Error actualizando trabajador',
            message: 'Ocurrió un error al intentar actualizar el trabajador'
        });
    }
});

//? FUNCTION: DELETE WORKER
app.delete('/trabajadores/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;

    try {
        await userQueries.delete(trabajadorId);
        res.status(200).json({ 
            message: 'Trabajador eliminado exitosamente',
            id: trabajadorId
        });
    } catch (error) {
        console.error('Error eliminando trabajador:', error);
        
        if (error.message === 'Trabajador no encontrado') {
            return res.status(404).json({ 
                error: 'Trabajador no encontrado',
                message: 'No existe un trabajador con el ID proporcionado'
            });
        }

        // Si hay un error de referencia (por ejemplo, si el trabajador tiene clientes asociados)
        if (error.code === '23503') {
            return res.status(400).json({ 
                error: 'No se puede eliminar el trabajador',
                message: 'El trabajador tiene clientes asociados. Elimine o transfiera los clientes primero.'
            });
        }

        res.status(500).json({ 
            error: 'Error eliminando trabajador',
            message: 'Ocurrió un error al intentar eliminar el trabajador'
        });
    }
});

app.get('/estadisticas/general', authenticateJWT, async (req, res) => {
    try {
        const stats = await statsQueries.getGeneralStats();
        
        // Procesar los datos para incluir cálculos adicionales
        const processedStats = stats.map(stat => {
            const fechaInicio = new Date(stat.fecha_inicio);
            const fechaTermino = new Date(stat.fecha_termino);
            const diasPrestamo = Math.ceil((fechaTermino - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
            
            let cobroDiario = null;
            if (diasPrestamo === 15 || diasPrestamo === 20) {
                cobroDiario = (stat.monto_inicial * 1.30) / diasPrestamo;
            }

            return {
                ...stat,
                dias_prestamo: diasPrestamo,
                cobro_diario: cobroDiario ? Number(cobroDiario.toFixed(2)) : null
            };
        });

        console.log(`Obtenidas ${processedStats.length} estadísticas generales`);
        res.json(processedStats);
    } catch (error) {
        handleError(error, res);
    }
});

app.get('/estadisticas/trabajadores', authenticateJWT, async (req, res) => {
    try {
        const stats = await statsQueries.getWorkerStats();
        
        // Procesar los datos para incluir totales
        const processedStats = stats.map(trabajador => {
            const totales = trabajador.clientes.reduce((acc, cliente) => {
                const abonos = cliente.abonos || [];
                return {
                    total_abonos_diarios: acc.total_abonos_diarios + (abonos.reduce((sum, a) => sum + (a.abono_diario || 0), 0)),
                    total_abonos_semanales: acc.total_abonos_semanales + (abonos.reduce((sum, a) => sum + (a.abono_semanal || 0), 0)),
                    total_multas_hoy: acc.total_multas_hoy + (cliente.total_multas_hoy || 0),
                    total_multas_semanales: acc.total_multas_semanales + (cliente.total_multas_semanales || 0)
                };
            }, {
                total_abonos_diarios: 0,
                total_abonos_semanales: 0,
                total_multas_hoy: 0,
                total_multas_semanales: 0
            });

            return {
                trabajador_id: trabajador.id,
                trabajador_nombre: trabajador.nombre,
                ...totales
            };
        });

        console.log(`Obtenidas ${processedStats.length} estadísticas de trabajadores`);
        res.json(processedStats);
    } catch (error) {
        handleError(error, res);
    }
});

// Ruta para obtener resumen de un cliente en específico
app.get('/estadisticas/cliente/:id', authenticateJWT, async (req, res) => {
    const clienteId = req.params.id;

    const query = `
        SELECT c.id, c.nombre, c.direccion, c.telefono, c.monto_inicial, c.fecha_inicio, c.fecha_termino, c.ocupacion, 
               DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 AS dias_prestamo,
               CASE 
                   WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 15 THEN ROUND((c.monto_inicial * 1.30) / 15, 2) 
                   WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 20 THEN ROUND((c.monto_inicial * 1.30) / 20, 2) 
                   ELSE NULL 
               END AS cobro_diario,
               SUM(m.monto) AS total_multas, 
               SUM(a.monto) AS total_abonos
        FROM clientes c
        LEFT JOIN multas m ON c.id = m.cliente_id
        LEFT JOIN abonos a ON c.id = a.cliente_id
        WHERE c.id = ?
        GROUP BY c.id;
    `;

    try {
        const cliente = await clientQueries.findById(clienteId);

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        console.log(`Obtenidas estadísticas del cliente ${clienteId}`);
        res.json(cliente);
    } catch (error) {
        console.error('Error obteniendo estadísticas del cliente:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas del cliente' });
    }
});

app.get('/estadisticas/trabajador/:id', authenticateJWT, async (req, res) => {
    const trabajadorId = req.params.id;

    const query = `
        SELECT 
            c.id, 
            c.nombre, 
            c.telefono, 
            c.monto_inicial, 
            c.fecha_inicio, 
            c.fecha_termino, 
            c.ocupacion, 
            DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 AS dias_prestamo,
            CASE 
                WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 15 THEN ROUND((c.monto_inicial * 1.30) / 15, 2) 
                WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 20 THEN ROUND((c.monto_inicial * 1.30) / 20, 2) 
                ELSE NULL 
            END AS cobro_diario,
            SUM(m.monto) AS total_multas, 
            SUM(a.monto) AS total_abonos
        FROM clientes c
        LEFT JOIN multas m ON c.id = m.cliente_id
        LEFT JOIN abonos a ON c.id = a.cliente_id
        WHERE c.trabajador_id = ?
        GROUP BY c.id;
    `;

    try {
        const trabajador = await userQueries.findById(trabajadorId);

        if (!trabajador) {
            return res.status(404).json({ error: 'Trabajador no encontrado' });
        }

        console.log(`Obtenidas estadísticas del trabajador ${trabajadorId}`);
        res.json(trabajador);
    } catch (error) {
        console.error('Error al obtener estadísticas del trabajador:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas del trabajador' });
    }
});

const sendEmailNotification = (subject, body) => {
    transporter.sendMail({
        from: '"Prestamos" <alison.cassin70@ethereal.email>',
        to: 'eduardogf312@gmail.com',
        subject: subject,
        text: body
    })
    .then(info => {
        console.log('Correo enviado: ' + info.response);
    })
    .catch(error => {
        console.error('Error al enviar correo:', error);
    });
};

// Rutas de backup (protegidas por autenticación y rol de administrador)
app.post('/api/backup/create', authenticateJWT, async (req, res) => {
    try {
        // Verificar que el usuario es administrador
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
        }

        await createBackup();
        res.json({ message: 'Backup iniciado exitosamente' });
    } catch (error) {
        console.error('Error iniciando backup:', error);
        res.status(500).json({ error: 'Error iniciando backup' });
    }
});

app.post('/api/backup/restore', authenticateJWT, async (req, res) => {
    try {
        // Verificar que el usuario es administrador
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
        }

        const { backupFile } = req.body;
        if (!backupFile) {
            return res.status(400).json({ error: 'Se requiere especificar el archivo de backup' });
        }

        await restoreBackup(backupFile);
        res.json({ message: 'Restauración iniciada exitosamente' });
    } catch (error) {
        console.error('Error iniciando restauración:', error);
        res.status(500).json({ error: 'Error iniciando restauración' });
    }
});


// Programar backups automáticos
// Backup diario a las 2 AM
cron.schedule('0 2 * * *', async () => {
    console.log('Iniciando backup diario programado...');
    try {
        await createBackup();
    } catch (error) {
        console.error('Error en backup diario programado:', error);
    }
}, {
    timezone: "America/Mexico_City"
});

// Backup semanal los domingos a las 3 AM
cron.schedule('0 3 * * 0', async () => {
    console.log('Iniciando backup semanal programado...');
    try {
        await createBackup();
    } catch (error) {
        console.error('Error en backup semanal programado:', error);
    }
}, {
    timezone: "America/Mexico_City"
});

// Health check route for UptimeRobot
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

app.get('/ping', (req, res) => {
    res.set('Cache-Control', 'no-store'); // evita respuestas 304
    res.status(200).json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

checkInitialDatabaseConnection().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
}).catch(error => {
    console.error('No se pudo iniciar el servidor debido a un error de conexión:', error);
});