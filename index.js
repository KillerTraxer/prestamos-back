const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.json());

const dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'prestamos.c34ku64umou5.us-east-1.rds.amazonaws.com',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'kPXAzxs2oFHgPMH4pUAD',
    database: process.env.DB_NAME || 'prestamos',
    connectionLimit: 10, // Número máximo de conexiones simultáneas
    connectTimeout: 10000, // Timeout de conexión en milisegundos
});

const nodemailer = require('nodemailer');

let transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
        user: 'alison.cassin70@ethereal.email',
        pass: 'cGyv97sBCv3CjBeBDC'
    }
});

transporter.sendMail = transporter.sendMail.bind(transporter);

// db.connect(err => {
//     if (err) {
//         console.error('Error conectando a la base de datos:', err);
//         throw err;
//     }
//     console.log('Conectado a la base de datos');
// });

// Event listener para eventos de conexión
dbPool.on('connection', function (connection) {
    console.log('Nueva conexión a la base de datos');
});

async function checkInitialDatabaseConnection() {
    try {
        const connection = await dbPool.getConnection();
        await connection.execute('SELECT 1');
        console.log('Conexión inicial a la base de datos exitosa');
        connection.release();
    } catch (error) {
        console.error('Error al verificar la conexión inicial:', error);
    }
}

// Función para obtener una conexión del pool
async function getConnection() {
    try {
        const connection = await dbPool.getConnection();
        console.log('Conexión obtenida del pool');
        return connection;
    } catch (error) {
        console.error('Error al obtener conexión del pool:', error);
        throw error;
    }
}

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];

        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        // jwt.verify(token, 'your_jwt_secret', (err, user) => {
            if (err) {
                console.error('Error verificando JWT:', err);
                return res.sendStatus(403);
            }
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// app.post('/login', (req, res) => {
//     const { email, password } = req.body;

//     db.query('SELECT * FROM usuarios WHERE email = ? AND password = ?', [email, password], (err, result) => {
//         if (err) {
//             console.error('Error en la consulta de login:', err);
//             throw err;
//         }

//         if (result.length > 0) {
//             const user = result[0];
//             console.log('Usuario autenticado:', user); // Agregar esta línea

//             const token = jwt.sign({ id: user.id, role: user.role }, 'your_jwt_secret', { expiresIn: '1d' });
//             console.log('Token generado:', token); // Agregar esta línea
//             res.json({ token });
//         } else {
//             console.log('Credenciales incorrectas para:', email);
//             res.status(401).json({ message: 'Credenciales incorrectas' });
//         }
//     });
// });

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const connection = await getConnection();
        try {
            const [rows] = await connection.execute('SELECT * FROM usuarios WHERE email = ? AND password = ?', [email, password]);

            if (rows.length > 0) {
                const user = rows[0];
                console.log('Usuario autenticado:', user);

                const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
                console.log('Token generado:', token);
                res.json({ token });
            } else {
                console.log('Credenciales incorrectas para:', email);
                res.status(401).json({ message: 'Credenciales incorrectas' });
            }
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error en la ruta /login:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});




app.get('/clientes', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const connection = await getConnection();
        try {
            const query = `
                SELECT c.*, COUNT(m.id) AS total_multas 
                FROM clientes c 
                LEFT JOIN multas m ON c.id = m.cliente_id 
                WHERE c.trabajador_id = ? 
                GROUP BY c.id`;

            const [rows] = await connection.execute(query, [req.user.id]);
            res.json(rows);
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({ message: 'Error en el servidor' });
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



app.post('/clientes', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const { nombre, ocupacion, direccion, telefono, fecha_termino, monto_inicial } = req.body;
    if (!nombre || !ocupacion || !direccion || !telefono || !fecha_termino || !monto_inicial) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const trabajador_id = req.user.id;
    const fecha_inicio = new Date();
    fecha_inicio.setDate(fecha_inicio.getDate() + 1); // Establece la fecha de inicio para el día siguiente
    fecha_inicio.setHours(0, 0, 0, 0); // Opcional: Establecer hora a 00:00 para la fecha exacta
    const fechaTerminoSeleccionada = new Date(fecha_termino);
    const dias = Math.ceil((fechaTerminoSeleccionada - fecha_inicio) / (1000 * 60 * 60 * 24));
    const tasaInteres = 0.30;

    const interesTotal = calcularInteresTotal(parseFloat(monto_inicial), tasaInteres);
    const totalAPagar = calcularTotalAPagar(parseFloat(monto_inicial), interesTotal);
    const pagosDiarios = calcularPagosDiarios(totalAPagar, dias);

    try {
        const connection = await getConnection();
        try {
            const query = `
                INSERT INTO clientes (
                    nombre, ocupacion, direccion, telefono, 
                    fecha_inicio, fecha_termino, multas, 
                    monto_inicial, monto_actual, estado, 
                    trabajador_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const [result] = await connection.execute(query, [
                nombre, ocupacion, direccion, telefono,
                fecha_inicio.toISOString().split('T')[0],
                fechaTerminoSeleccionada.toISOString().split('T')[0],
                '0', monto_inicial, totalAPagar, 'pendiente',
                trabajador_id
            ]);
            res.status(201).json({
                message: 'Cliente creado',
                id: result.insertId,
                pagos_diarios: pagosDiarios
            });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error creando cliente:', error);
        res.status(500).json({ error: 'Error creando cliente' });
    }
});


app.get('/clientes/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const connection = await getConnection();
        try {
            const query = `
                SELECT c.*, COUNT(m.id) AS total_multas
                FROM clientes c 
                LEFT JOIN multas m ON c.id = m.cliente_id 
                WHERE c.id = ? 
                GROUP BY c.id`;

            const [rows] = await connection.execute(query, [clienteId]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }

            res.json(rows[0]);
        } finally {
            connection.release();
        }
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
        const connection = await getConnection();
        try {
            const query = `
                UPDATE clientes 
                SET nombre = ?, ocupacion = ?, direccion = ?, telefono = ?, fecha_inicio = ?, fecha_termino = ?, monto_inicial = ?, monto_actual = ?, estado = ? 
                WHERE id = ?`;

            const [result] = await connection.execute(query, [
                nombre, ocupacion, direccion, telefono, fecha_inicio, fecha_termino, monto_inicial, monto_actual, nuevoEstado, clienteId
            ]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }

            res.json({ message: 'Cliente actualizado correctamente' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error actualizando cliente:', error);
        res.status(500).json({ error: 'Error actualizando cliente' });
    }
});

app.delete('/clientes/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute('DELETE FROM clientes WHERE id = ?', [clienteId]);

            if (result.affectedRows === 0) {
                res.status(404).json({ message: 'Cliente no encontrado' });
            } else {
                res.json({ message: 'Cliente eliminado correctamente' });
            }
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error eliminando cliente:', error);
        res.status(500).json({ error: 'Error eliminando cliente' });
    }
});



app.get('/clientes/:id/multas', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute('SELECT id, fecha, monto, estado FROM multas WHERE cliente_id = ?', [clienteId]);

            console.log(`Obtenidas ${result.length} multas para el cliente con ID: ${clienteId}`);
            res.json(result);
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo multas:', error);
        res.status(500).json({ error: 'Error obteniendo multas' });
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
        const connection = await getConnection();

        try {
            // Obtener datos del cliente
            const [clienteResult] = await connection.execute('SELECT monto_inicial, monto_actual, fecha_termino FROM clientes WHERE id = ?', [clienteId]);

            if (clienteResult.length === 0) {
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }

            const cliente = clienteResult[0];
            const montoMulta = montoMultaFija;

            // Crear multa
            await connection.execute(
                'INSERT INTO multas (cliente_id, fecha, monto, estado) VALUES (?, ?, ?, ?)',
                [clienteId, fecha, montoMulta, 'pendiente']
            );

            // Contar las multas diarias y semanales
            const [multasCountResult] = await connection.execute(`
                SELECT 
                    IFNULL(SUM(CASE WHEN DATE(fecha) = CURDATE() THEN 1 ELSE 0 END), 0) AS total_multas_hoy,
                    IFNULL(SUM(CASE WHEN YEARWEEK(fecha, 1) = YEARWEEK(CURDATE(), 1) THEN 1 ELSE 0 END), 0) AS total_multas_semanales
                FROM multas
                WHERE cliente_id = ?
            `, [clienteId]);

            const totalMultasHoy = multasCountResult[0].total_multas_hoy;
            const totalMultasSemanales = multasCountResult[0].total_multas_semanales;

            const nuevoMonto = parseFloat(cliente.monto_actual) + montoMulta;
            const nuevaFechaTermino = new Date(cliente.fecha_termino);

            if (totalMultasHoy % 3 === 0) {
                nuevaFechaTermino.setDate(nuevaFechaTermino.getDate() + 1);
            }

            // Actualizar cliente
            await connection.execute(
                'UPDATE clientes SET monto_actual = ?, fecha_termino = ?, total_multas_hoy = ?, total_multas_semanales = ? WHERE id = ?',
                [nuevoMonto, nuevaFechaTermino, totalMultasHoy, totalMultasSemanales, clienteId]
            );

            res.status(201).json({
                message: 'Multa creada y monto actualizado',
                nuevoMonto,
                nuevaFechaTermino,
                totalMultasHoy,
                totalMultasSemanales
            });
        } catch (error) {
            console.error('Error procesando multa:', error);
            res.status(500).json({ error: 'Error procesando multa' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
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
        const connection = await getConnection();

        try {
            // Verificar estado del cliente
            const [clienteResult] = await connection.execute('SELECT monto_actual, estado FROM clientes WHERE id = ?', [clienteId]);

            if (clienteResult.length === 0) {
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }

            const cliente = clienteResult[0];

            if (cliente.estado === 'completado') {
                return res.status(400).json({ error: 'No se pueden agregar más abonos, el cliente está completado' });
            }

            const nuevoMontoActual = cliente.monto_actual - parseFloat(monto);

            // Crear abono
            const [abonoResult] = await connection.execute(
                'INSERT INTO abonos (cliente_id, monto, abono_diario, abono_semanal, fecha, estado) VALUES (?, ?, ?, ?, ?, ?)',
                [clienteId, parseFloat(monto), parseFloat(monto), parseFloat(monto), fecha, 'pagado']
            );

            // Actualizar cliente
            await connection.execute(
                'UPDATE clientes SET monto_actual = ?, estado = ? WHERE id = ?',
                [nuevoMontoActual, nuevoMontoActual <= 0 ? 'completado' : cliente.estado, clienteId]
            );

            res.status(201).json({
                message: nuevoMontoActual <= 0 ? 'Abono creado y cliente completado' : 'Abono creado',
                abonoId: abonoResult.insertId
            });
        } catch (error) {
            console.error('Error procesando abono:', error);
            res.status(500).json({ error: 'Error procesando abono' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});



app.get('/clientes/:id/abonos', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute('SELECT id, monto, fecha, estado FROM abonos WHERE cliente_id = ?', [clienteId]);

            console.log(`Obtenidos ${result.length} abonos para el cliente con ID: ${clienteId}`);
            res.json(result);
        } catch (error) {
            console.error('Error obteniendo abonos:', error);
            res.status(500).json({ error: 'Error obteniendo abonos' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


app.get('/trabajadores', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const query = `
        SELECT u.id, u.nombre, u.email, u.role, c.id AS cliente_id, c.nombre AS cliente_nombre, c.ocupacion, c.direccion, c.telefono, c.fecha_inicio, c.fecha_termino, c.monto_inicial, c.monto_actual, c.estado, COUNT(m.id) AS total_multas, COUNT(a.id) AS total_abonos
        FROM usuarios u
        LEFT JOIN clientes c ON u.id = c.trabajador_id
        LEFT JOIN multas m ON c.id = m.cliente_id
        LEFT JOIN abonos a ON c.id = a.cliente_id
        WHERE u.role = 'trabajador'
        GROUP BY u.id, c.id
        ORDER BY u.nombre, c.nombre`;

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(query);

            console.log(`Obtenidos ${result.length} registros de trabajadores`);

            const trabajadores = result.reduce((acc, row) => {
                const trabajador = acc.find(t => t.id === row.id);
                if (trabajador) {
                    trabajador.clientes.push({
                        id: row.cliente_id,
                        nombre: row.cliente_nombre,
                        ocupacion: row.ocupacion,
                        direccion: row.direccion,
                        telefono: row.telefono,
                        fecha_inicio: row.fecha_inicio,
                        fecha_termino: row.fecha_termino,
                        monto_inicial: row.monto_inicial,
                        monto_actual: row.monto_actual,
                        estado: row.estado,
                        total_multas: row.total_multas,
                        total_abonos: row.total_abonos
                    });
                } else {
                    acc.push({
                        id: row.id,
                        nombre: row.nombre,
                        email: row.email,
                        role: row.role,
                        clientes: row.cliente_id ? [{
                            id: row.cliente_id,
                            nombre: row.cliente_nombre,
                            ocupacion: row.ocupacion,
                            direccion: row.direccion,
                            telefono: row.telefono,
                            fecha_inicio: row.fecha_inicio,
                            fecha_termino: row.fecha_termino,
                            monto_inicial: row.monto_inicial,
                            monto_actual: row.monto_actual,
                            estado: row.estado,
                            total_multas: row.total_multas,
                            total_abonos: row.total_abonos
                        }] : []
                    });
                }
                return acc;
            }, []);

            console.log(`Procesados ${trabajadores.length} trabajadores`);
            res.json(trabajadores);
        } catch (error) {
            console.error('Error obteniendo datos de trabajadores:', error);
            res.status(500).json({ error: 'Error obteniendo datos de trabajadores' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

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
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(query, [trabajadorId]);

            console.log(`Obtenidos ${result.length} clientes para el trabajador con ID: ${trabajadorId}`);
            res.json(result);
        } catch (error) {
            console.error('Error obteniendo clientes:', error);
            res.status(500).json({ error: 'Error obteniendo clientes' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/trabajadores', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { nombre, email, password, role } = req.body;

    if (!nombre || !email || !password || !role) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    try {
        const connection = await getConnection();

        try {
            // ADVERTENCIA: No se está encriptando la contraseña. Esto es muy peligroso desde el punto de vista de la seguridad.
            const [result] = await connection.execute('INSERT INTO usuarios (nombre, email, password, role) VALUES (?, ?, ?, ?)', [nombre, email, password, role]);

            console.log(`Trabajador creado con ID: ${result.insertId}`);
            res.status(201).json({ message: 'Trabajador creado', id: result.insertId });
        } catch (error) {
            console.error('Error creando trabajador:', error);
            res.status(500).json({ error: 'Error creando trabajador' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/trabajadores/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;
    const { nombre, email, role } = req.body;

    if (!nombre || !email || !role) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(
                'UPDATE usuarios SET nombre = ?, email = ?, role = ? WHERE id = ?',
                [nombre, email, role, trabajadorId]
            );

            if (result.affectedRows === 0) {
                console.log(`No se encontró trabajador con ID: ${trabajadorId}`);
                return res.status(404).json({ error: 'Trabajador no encontrado' });
            }

            console.log(`Trabajador con ID ${trabajadorId} actualizado`);
            res.status(200).json({ message: 'Trabajador actualizado' });
        } catch (error) {
            console.error('Error actualizando trabajador:', error);
            res.status(500).json({ error: 'Error actualizando trabajador' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/trabajadores/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute('DELETE FROM usuarios WHERE id = ?', [trabajadorId]);

            if (result.affectedRows === 0) {
                console.log(`No se encontró trabajador con ID: ${trabajadorId}`);
                return res.status(404).json({ error: 'Trabajador no encontrado' });
            }

            console.log(`Eliminado trabajador con ID: ${trabajadorId}`);
            res.status(200).json({ message: 'Trabajador eliminado' });
        } catch (error) {
            console.error('Error eliminando trabajador:', error);
            res.status(500).json({ error: 'Error eliminando trabajador' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Ruta para eliminar un cliente
app.delete('/clientes/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute('DELETE FROM clientes WHERE id = ?', [clienteId]);

            if (result.affectedRows === 0) {
                console.log(`No se encontró cliente con ID: ${clienteId}`);
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }

            console.log(`Eliminado cliente con ID: ${clienteId}`);
            res.status(200).json({ message: 'Cliente eliminado correctamente' });
        } catch (error) {
            console.error('Error eliminando cliente:', error);
            res.status(500).json({ error: 'Error eliminando cliente' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/estadisticas/general', authenticateJWT, async (req, res) => {
    const query = `
        SELECT c.id, c.nombre, c.telefono, c.monto_inicial, c.fecha_inicio, c.fecha_termino, c.ocupacion, c.estado, c.direccion,
            DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 AS dias_prestamo,
            CASE 
                WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 15 THEN ROUND((c.monto_inicial * 1.30) / 15, 2) 
                WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 20 THEN ROUND((c.monto_inicial * 1.30) / 20, 2) 
                ELSE NULL 
            END AS cobro_diario
        FROM clientes c
        GROUP BY c.id;
    `;

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(query);

            console.log(`Obtenidas ${result.length} estadísticas generales`);
            res.json(result);
        } catch (error) {
            console.error('Error obteniendo estadísticas generales:', error);
            res.status(500).json({ error: 'Error obteniendo estadísticas generales' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/estadisticas/trabajadores', authenticateJWT, async (req, res) => {
    const query = `
   SELECT 
    u.id AS trabajador_id, 
    u.nombre AS trabajador_nombre,
    SUM(a.abono_diario) AS total_abonos_diarios,
    SUM(a.abono_semanal) AS total_abonos_semanales,
    SUM(c.total_multas_hoy) AS total_multas_hoy,
    SUM(c.total_multas_semanales) AS total_multas_semanales
FROM usuarios u
LEFT JOIN clientes c ON u.id = c.trabajador_id
LEFT JOIN abonos a ON c.id = a.cliente_id
GROUP BY u.id, u.nombre;

    `;

    try {
        const connection = await getConnection();

        try {
            const [results] = await connection.execute(query);

            console.log(`Obtenidas ${results.length} estadísticas de trabajadores`);
            res.json(results);
        } catch (error) {
            console.error('Error obteniendo estadísticas de trabajadores:', error);
            res.status(500).json({ error: 'Error obteniendo estadísticas de trabajadores' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
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


// Cron job que se ejecuta diariamente a las 5 a.m. hora de México
cron.schedule('19 1 * * *', async () => {
    const resetAbonoDiarioQuery = 'UPDATE abonos SET abono_diario = 0 WHERE abono_diario != 0';

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(resetAbonoDiarioQuery);

            console.log(`Reiniciado campo abono_diario a 0. Registros afectados: ${result.affectedRows}`);

            sendEmailNotification(
                'Actualización diaria de abonos',
                `Se ha reiniciado el campo abono_diario a 0. Registros afectados: ${result.affectedRows}`
            );
        } catch (error) {
            console.error('Error al reiniciar el campo abono_diario:', error);

            sendEmailNotification(
                'Error en la actualización diaria de abonos',
                `Error al intentar reiniciar el campo abono_diario: ${error.message}`
            );
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);

        sendEmailNotification(
            'Error general en la conexión a la base de datos',
            `Error al intentar obtener una conexión a la base de datos: ${error.message}`
        );
    }
}, {
    timezone: "America/Mexico_City"  // Ajuste para la zona horaria de México
});

cron.schedule('0 5 * * 1', async () => {
    const resetAbonoSemanalQuery = 'UPDATE abonos SET abono_semanal = 0 WHERE abono_semanal != 0';

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(resetAbonoSemanalQuery);

            console.log(`Reiniciado campo abono_semanal a 0. Registros afectados: ${result.affectedRows}`);

            sendEmailNotification(
                'Actualización semanal de abonos',
                `Se ha reiniciado el campo abono_semanal a 0. Registros afectados: ${result.affectedRows}`
            );
        } catch (error) {
            console.error('Error al reiniciar el campo abono_semanal:', error);

            sendEmailNotification(
                'Error en la actualización semanal de abonos',
                `Error al intentar reiniciar el campo abono_semanal: ${error.message}`
            );
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
    }
}, {
    timezone: "America/Mexico_City"  // Ajuste para la zona horaria de México
});

// Cron job que se ejecuta diariamente a las 5 a.m. hora de México
cron.schedule('17 1 * * *', async () => {
    const resetTotalMultasHoyQuery = 'UPDATE clientes SET total_multas_hoy = 0 WHERE total_multas_hoy != 0';

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(resetTotalMultasHoyQuery);

            console.log(`Reiniciado campo total_multas_hoy a 0. Registros afectados: ${result.affectedRows}`);

            sendEmailNotification(
                'Actualización diaria de multas',
                `Se ha reiniciado el campo total_multas_hoy a 0. Registros afectados: ${result.affectedRows}`
            );
        } catch (error) {
            console.error('Error al reiniciar el campo total_multas_hoy:', error);

            sendEmailNotification(
                'Error en la actualización diaria de multas',
                `Error al intentar reiniciar el campo total_multas_hoy: ${error.message}`
            );
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);

        sendEmailNotification(
            'Error general en la conexión a la base de datos',
            `Error al intentar obtener una conexión a la base de datos: ${error.message}`
        );
    }
}, {
    timezone: "America/Mexico_City"  // Ajuste para la zona horaria de México
});

cron.schedule('3 12 * * *', async () => {
    const resetTotalMultasSemanalesQuery = 'UPDATE clientes SET total_multas_semanales = 0 WHERE total_multas_semanales != 0';

    try {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(resetTotalMultasSemanalesQuery);

            console.log(`Reiniciado campo total_multas_semanales a 0. Registros afectados: ${result.affectedRows}`);

            sendEmailNotification(
                'Actualización semanales de multas',
                `Se ha reiniciado el campo total_multas_hoy a 0. Registros afectados: ${result.affectedRows}`
            );
        } catch (error) {
            console.error('Error al reiniciar el campo total_multas_semanales:', error);
            sendEmailNotification(
                'Error en la actualización semanales de multas',
                `Error al intentar reiniciar el campo total_multas_semanales: ${error.message}`
            );
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);

        sendEmailNotification(
            'Error general en la conexión a la base de datos',
            `Error al intentar obtener una conexión a la base de datos: ${error.message}`
        );
    }
}, {
    timezone: "America/Mexico_City"  // Ajuste para la zona horaria de México
});

// Cron job que se ejecuta cada 2 minutos
cron.schedule('*/1 * * * *', async () => {
    const checkConfigurationJob = async () => {
        try {
            // Verifica la conexión a la base de datos
            const connection = await getConnection();
            await connection.execute('SELECT 1');
            console.log('Conexión a la base de datos válida');

            // Verifica la configuración de nodemailer
            const testEmail = await transporter.sendMail({
                from: '"Prestamos"',
                to: 'eduardogf312@gmail.com',
                subject: 'Test Email',
                text: 'This is a test email sent from your application.'
            });

            console.log('Correo de prueba enviado correctamente');

            // Verifica la configuración de cron
            console.log('Cron job de verificación ejecutándose correctamente');

            // Envía un correo de éxito
            sendEmailNotification(
                'Verificación de configuración exitosa',
                'El cron job de verificación se ejecutó correctamente.'
            );

        } catch (error) {
            console.error('Error en la verificación de configuración:', error);
            sendEmailNotification(
                'Error en la verificación de configuración',
                `Ocurrió un error durante la verificación de configuración: ${error.message}`
            );
        }
    };

    await checkConfigurationJob();
}, {
    timezone: "America/Mexico_City"
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
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(query, [clienteId]);

            if (result.length === 0) {
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }

            console.log(`Obtenidas estadísticas del cliente ${clienteId}`);
            res.json(result[0]);
        } catch (error) {
            console.error('Error obteniendo estadísticas del cliente:', error);
            res.status(500).json({ error: 'Error obteniendo estadísticas del cliente' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
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
        const connection = await getConnection();

        try {
            const [results] = await connection.execute(query, [trabajadorId]);

            if (results.length === 0) {
                return res.status(404).json({ error: 'Trabajador no encontrado' });
            }

            console.log(`Obtenidas estadísticas del trabajador ${trabajadorId}`);
            res.json(results);
        } catch (error) {
            console.error('Error al obtener estadísticas del trabajador:', error);
            res.status(500).json({ error: 'Error al obtener estadísticas del trabajador' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error obteniendo conexión:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// app.listen(PORT, () => {
//     console.log(`Servidor corriendo en el puerto ${PORT}`);
// });

checkInitialDatabaseConnection().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
}).catch(error => {
    console.error('No se pudo iniciar el servidor debido a un error de conexión:', error);
});