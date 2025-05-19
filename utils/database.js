const { supabase, supabaseAdmin } = require('../config/supabase');
const { auth } = require('../config/supabase');
const passwordUtils = require('../utils/password');

// Función auxiliar para reintentar operaciones
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.log(`Intento ${i + 1} fallido:`, error.message);
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
            }
        }
    }
    throw lastError;
};

// Funciones de utilidad para manejar errores de Supabase
const handleError = (error, res) => {
    console.error('Error en la operación:', error);

    // Errores de autenticación y autorización
    if (error.code === '42P17') {
        return res.status(500).json({
            error: 'Error de configuración de seguridad',
            message: 'Error en las políticas de seguridad de la base de datos'
        });
    }

    if (error.code === '23505') {
        return res.status(400).json({
            error: 'Dato duplicado',
            message: 'Ya existe un registro con estos datos'
        });
    }

    if (error.code === '23503') {
        return res.status(400).json({
            error: 'Error de referencia',
            message: 'No se puede realizar la operación porque hay datos relacionados'
        });
    }

    // Errores de Supabase Auth
    if (error.message?.includes('Invalid login credentials')) {
        return res.status(401).json({
            error: 'Credenciales inválidas',
            message: 'El email o la contraseña son incorrectos'
        });
    }

    if (error.message?.includes('Email not confirmed')) {
        return res.status(401).json({
            error: 'Email no confirmado',
            message: 'Por favor, confirma tu email antes de iniciar sesión'
        });
    }

    if (error.message?.includes('User already registered')) {
        return res.status(400).json({
            error: 'Usuario ya registrado',
            message: 'Ya existe una cuenta con este email'
        });
    }

    if (error.message?.includes('Password recovery requires an email')) {
        return res.status(400).json({
            error: 'Email requerido',
            message: 'Por favor, proporciona un email para recuperar la contraseña'
        });
    }

    if (error.message?.includes('Unable to validate email address: invalid format')) {
        return res.status(400).json({
            error: 'Formato de email inválido',
            message: 'Por favor, proporciona un email válido'
        });
    }

    // Errores de validación
    if (error.message?.includes('validation failed')) {
        return res.status(400).json({
            error: 'Error de validación',
            message: 'Los datos proporcionados no son válidos'
        });
    }

    // Errores de permisos
    if (error.message?.includes('permission denied')) {
        return res.status(403).json({
            error: 'Permiso denegado',
            message: 'No tienes permisos para realizar esta acción'
        });
    }

    // Errores de conexión
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
            error: 'Error de conexión',
            message: 'No se pudo conectar con la base de datos'
        });
    }

    // Errores de recursos no encontrados
    if (error.code === 'PGRST116') {
        return res.status(404).json({
            error: 'Recurso no encontrado',
            message: 'No se encontró el registro solicitado'
        });
    }

    // Para cualquier otro error no manejado específicamente
    return res.status(500).json({
        error: 'Error en la operación',
        message: 'Ocurrió un error al procesar la solicitud',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
};

// Funciones para usuarios
const userQueries = {
    async findByEmail(email) {
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();
        
        if (error) throw error;
        return data;
    },

    async create(userData) {
        // Asegurarnos de que la contraseña esté incluida
        const userDataWithPassword = {
            ...userData,
            password: userData.password || '' // Añadir contraseña vacía si no se proporciona
        };

        const { data, error } = await supabaseAdmin
            .from('usuarios')
            .insert([userDataWithPassword])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async createWorker(nombre, email, password, role) {
        try {
            console.log('Verificando disponibilidad del email:', email);

            // Verificar si el usuario existe en Supabase Auth
            const { data: authUsers, error: authCheckError } = await supabaseAdmin.auth.admin.listUsers();
            
            if (authCheckError) {
                console.error('Error verificando usuarios en Auth:', authCheckError);
                throw authCheckError;
            }

            // Verificar si el email ya está en uso en Auth
            const existingAuthUser = authUsers?.users?.find(user => user.email === email);
            if (existingAuthUser) {
                console.log('Email ya registrado en Auth:', email);
                throw new Error('El email ya está registrado en el sistema');
            }

            // Verificar si el usuario existe en nuestra base de datos
            const { data: existingDbUsers, error: dbCheckError } = await supabaseAdmin
                .from('usuarios')
                .select('id, email')
                .eq('email', email);

            if (dbCheckError) {
                console.error('Error verificando usuario en base de datos:', dbCheckError);
                throw dbCheckError;
            }

            // Si el email ya está en uso en la base de datos, rechazar la creación
            if (existingDbUsers && existingDbUsers.length > 0) {
                console.log('Email ya registrado en la base de datos:', email);
                throw new Error('El email ya está registrado en el sistema');
            }

            // Crear usuario en Supabase Auth
            console.log('Creando usuario en Auth...');
            const { data: authUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { nombre, role }
            });

            if (signUpError) {
                console.error('Error en Supabase Auth:', signUpError);
                throw signUpError;
            }

            if (!authUser || !authUser.user || !authUser.user.id) {
                throw new Error('No se pudo crear el usuario en Auth');
            }

            console.log('Usuario creado en Auth:', authUser.user.id);

            // Hashear la contraseña
            const hashedPassword = await passwordUtils.hashPassword(password);

            // Crear usuario en la base de datos
            console.log('Creando usuario en base de datos...');
            const { data: userData, error: insertError } = await supabaseAdmin
                .from('usuarios')
                .insert([{
                    email,
                    nombre,
                    role,
                    password: hashedPassword,
                    auth_id: authUser.user.id
                }])
                .select()
                .single();

            if (insertError) {
                console.error('Error insertando en base de datos:', insertError);
                // Si falla la inserción, intentamos eliminar el usuario de Auth
                try {
                    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
                    console.log('Usuario eliminado de Auth después de error en base de datos');
                } catch (deleteError) {
                    console.error('Error eliminando usuario de Auth:', deleteError);
                }
                throw insertError;
            }

            if (!userData) {
                throw new Error('No se pudo crear el usuario en la base de datos');
            }

            console.log('Usuario creado exitosamente:', userData);
            return userData;
        } catch (error) {
            console.error('Error detallado creando trabajador:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });

            if (error.code === 'email_exists' || error.message.includes('already registered') || error.message.includes('ya está registrado')) {
                throw new Error('El email ya está registrado en el sistema');
            }

            throw error;
        }
    },

    async findAllWorkers() {
        try {
            // Obtener todos los trabajadores con sus clientes y estadísticas
            const { data, error } = await supabaseAdmin
                .from('usuarios')
                .select(`
                    id,
                    nombre,
                    email,
                    role,
                    clientes (
                        id,
                        nombre,
                        ocupacion,
                        direccion,
                        telefono,
                        fecha_inicio,
                        fecha_termino,
                        monto_inicial,
                        monto_actual,
                        estado,
                        multas (
                            id
                        ),
                        abonos (
                            id
                        )
                    )
                `)
                .eq('role', 'trabajador')
                .order('nombre');

            if (error) {
                console.error('Error en findAllWorkers:', error);
                throw error;
            }

            // Procesar los datos para incluir los conteos
            const processedData = data.map(trabajador => ({
                id: trabajador.id,
                nombre: trabajador.nombre,
                email: trabajador.email,
                role: trabajador.role,
                clientes: trabajador.clientes.map(cliente => ({
                    id: cliente.id,
                    nombre: cliente.nombre,
                    ocupacion: cliente.ocupacion,
                    direccion: cliente.direccion,
                    telefono: cliente.telefono,
                    fecha_inicio: cliente.fecha_inicio,
                    fecha_termino: cliente.fecha_termino,
                    monto_inicial: cliente.monto_inicial,
                    monto_actual: cliente.monto_actual,
                    estado: cliente.estado,
                    total_multas: cliente.multas?.length || 0,
                    total_abonos: cliente.abonos?.length || 0
                }))
            }));

            console.log(`Encontrados ${processedData.length} trabajadores con sus clientes`);
            return processedData;
        } catch (error) {
            console.error('Error en findAllWorkers:', error);
            throw error;
        }
    },

    async updateWorker(id, nombre, email, role) {
        try {
            // Primero verificar si el trabajador existe y obtener su auth_id
            const { data: existingWorker, error: findError } = await supabaseAdmin
                .from('usuarios')
                .select('id, email, auth_id')
                .eq('id', id)
                .single();

            if (findError) {
                if (findError.code === 'PGRST116') {
                    throw new Error('Trabajador no encontrado');
                }
                throw findError;
            }

            // Verificar si el nuevo email ya está en uso por otro usuario
            if (email !== existingWorker.email) {
                const { data: existingEmail, error: emailError } = await supabaseAdmin
                    .from('usuarios')
                    .select('id')
                    .eq('email', email)
                    .neq('id', id)
                    .single();

                if (emailError && emailError.code !== 'PGRST116') {
                    throw emailError;
                }

                if (existingEmail) {
                    throw new Error('El email ya está registrado por otro usuario');
                }

                // Actualizar el email en Supabase Auth si existe auth_id
                if (existingWorker.auth_id) {
                    try {
                        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                            existingWorker.auth_id,
                            { 
                                email: email,
                                user_metadata: { nombre, role }
                            }
                        );

                        if (authError) {
                            console.error('Error actualizando usuario en Auth:', authError);
                            throw new Error('Error actualizando el email en la autenticación');
                        }
                    } catch (authError) {
                        console.error('Error en actualización de Auth:', authError);
                        throw new Error('No se pudo actualizar la información de autenticación');
                    }
                }
            } else {
                // Si solo cambió el nombre o rol, actualizar los metadatos en Auth
                if (existingWorker.auth_id) {
                    try {
                        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                            existingWorker.auth_id,
                            { user_metadata: { nombre, role } }
                        );

                        if (authError) {
                            console.error('Error actualizando metadatos en Auth:', authError);
                            throw new Error('Error actualizando la información en la autenticación');
                        }
                    } catch (authError) {
                        console.error('Error en actualización de metadatos en Auth:', authError);
                        throw new Error('No se pudo actualizar la información de autenticación');
                    }
                }
            }

            // Actualizar el trabajador en la base de datos
            const { data, error } = await supabaseAdmin
                .from('usuarios')
                .update({ nombre, email, role })
                .eq('id', id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error en updateWorker:', error);
            throw error;
        }
    },

    async findById(id) {
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        return data;
    },

    async delete(id) {
        try {
            // Primero verificar si el trabajador existe y obtener su auth_id
            const { data: worker, error: findError } = await supabaseAdmin
                .from('usuarios')
                .select('id, auth_id')
                .eq('id', id)
                .single();

            if (findError) {
                if (findError.code === 'PGRST116') {
                    throw new Error('Trabajador no encontrado');
                }
                throw findError;
            }

            // Eliminar el usuario de la base de datos
            const { error: deleteError } = await supabaseAdmin
                .from('usuarios')
                .delete()
                .eq('id', id);

            if (deleteError) {
                throw deleteError;
            }

            // Si el trabajador tiene auth_id, eliminarlo también de Auth
            if (worker.auth_id) {
                try {
                    await supabaseAdmin.auth.admin.deleteUser(worker.auth_id);
                    console.log('Usuario eliminado de Auth:', worker.auth_id);
                } catch (authError) {
                    console.error('Error eliminando usuario de Auth:', authError);
                    // No lanzamos el error aquí para no interrumpir el proceso
                    // ya que el usuario ya fue eliminado de la base de datos
                }
            }

            return true;
        } catch (error) {
            console.error('Error en delete:', error);
            throw error;
        }
    }
};

// Funciones para clientes
const clientQueries = {
    async findAll() {
        const { data, error } = await supabase
            .from('clientes')
            .select('*');
        
        if (error) throw error;
        return data;
    },

    async create(clientData) {
        const { data, error } = await supabase
            .from('clientes')
            .insert([clientData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async findById(id) {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        return data;
    },

    async findByWorkerId(workerId) {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('trabajador_id', workerId);
        
        if (error) throw error;
        return data;
    },

    async update(id, updateData) {
        const { data, error } = await supabase
            .from('clientes')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async delete(id) {
        const { error } = await supabase
            .from('clientes')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        return true;
    }
};

// Funciones para multas
const multaQueries = {
    async create(multaData) {
        const { data, error } = await supabase
            .from('multas')
            .insert([multaData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async findByClientId(clientId) {
        const { data, error } = await supabase
            .from('multas')
            .select('*')
            .eq('cliente_id', clientId);
        
        if (error) throw error;
        return data;
    }
};

// Funciones para abonos
const abonoQueries = {
    async create(abonoData) {
        const { data, error } = await supabase
            .from('abonos')
            .insert([abonoData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async findByClientId(clientId) {
        const { data, error } = await supabase
            .from('abonos')
            .select('*')
            .eq('cliente_id', clientId);
        
        if (error) throw error;
        return data;
    },

    async resetDailyAbonos() {
        const { error } = await supabase
            .from('abonos')
            .update({ abono_diario: 0 })
            .neq('abono_diario', 0);
        
        if (error) throw error;
        return true;
    },

    async resetWeeklyAbonos() {
        const { error } = await supabase
            .from('abonos')
            .update({ abono_semanal: 0 })
            .neq('abono_semanal', 0);
        
        if (error) throw error;
        return true;
    }
};

// Funciones para estadísticas
const statsQueries = {
    async getGeneralStats() {
        const { data, error } = await supabase
            .from('clientes')
            .select(`
                id,
                nombre,
                telefono,
                monto_inicial,
                fecha_inicio,
                fecha_termino,
                ocupacion,
                estado,
                direccion
            `);
        
        if (error) throw error;
        return data;
    },

    async getWorkerStats() {
        const { data, error } = await supabase
            .from('usuarios')
            .select(`
                id,
                nombre,
                clientes (
                    id,
                    abonos (
                        abono_diario,
                        abono_semanal
                    ),
                    total_multas_hoy,
                    total_multas_semanales
                )
            `)
            .eq('role', 'trabajador');
        
        if (error) throw error;
        return data;
    }
};

module.exports = {
    handleError,
    userQueries,
    clientQueries,
    multaQueries,
    abonoQueries,
    statsQueries
}; 