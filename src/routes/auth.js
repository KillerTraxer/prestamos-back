const express = require('express');
const router = express.Router();
const { auth } = require('../config/supabase');
const { authenticateJWT } = require('../middleware/auth');
const passwordUtils = require('../utils/password');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');

// Ruta de registro
router.post('/signup', async (req, res) => {
    const { email, password, nombre, role } = req.body;

    try {
        if (!email || !password || !nombre) {
            return res.status(400).json({
                error: 'Datos incompletos',
                details: 'El email, contraseña y nombre son requeridos'
            });
        }

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
        const { data: authData, error: signUpError } = await auth.signUp(email, password, { 
            nombre: nombre,  // Asegurarse de que el nombre se pase correctamente
            role: role || 'user' // Valor por defecto si no se proporciona
        });

        if (signUpError) {
            console.error('Error en signUp:', signUpError);
            return res.status(400).json({ 
                error: 'Error al crear usuario',
                details: signUpError.message
            });
        }

        if (!authData || !authData.user) {
            console.error('Error: No se recibieron datos del usuario después del signUp');
            return res.status(500).json({
                error: 'Error al crear usuario',
                details: 'No se pudo crear el usuario en el sistema de autenticación'
            });
        }

        // Hashear la contraseña antes de guardarla en la base de datos
        const hashedPassword = await passwordUtils.hashPassword(password);

        // Crear usuario en la base de datos usando el método estático de la clase User
        console.log('Creando usuario en base de datos...', {
            email,
            nombre,
            role: role || 'user',
            auth_id: authData.user.id
        });

        const userData = await User.create({
            email,
            nombre,
            role: role || 'user',
            password: hashedPassword,
            auth_id: authData.user.id
        });

        console.log('Usuario creado exitosamente:', userData.id);
        res.status(201).json({
            message: 'Usuario creado exitosamente',
            user: {
                id: userData.id,
                email: userData.email,
                nombre: userData.nombre,
                role: userData.role
            }
        });
    } catch (error) {
        console.error('Error en registro:', error);
        
        // Si el error es de violación de not-null constraint
        if (error.code === '23502') {
            return res.status(400).json({
                error: 'Datos inválidos',
                message: 'Todos los campos requeridos deben ser proporcionados',
                details: error.message
            });
        }
        
        res.status(500).json({ 
            error: 'Error en el registro',
            message: error.message 
        });
    }
});

// Ruta de login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        console.log('Iniciando proceso de login para:', email);

        if (!email || !password) {
            return res.status(400).json({
                error: 'Datos incompletos',
                message: 'El email y la contraseña son requeridos'
            });
        }

        // Primero buscar en la tabla de usuarios (admins)
        console.log('Buscando usuario en tabla de usuarios...');
        let adminUser = null;
        try {
            adminUser = await User.findByEmail(email);
        } catch (error) {
            if (error.code !== 'PGRST116') {
                throw error;
            }
            // Si el error es PGRST116 (no encontrado), continuamos con la búsqueda en trabajadores
            console.log('Usuario no encontrado en tabla de usuarios, continuando búsqueda...');
        }
        
        if (adminUser) {
            console.log('Usuario encontrado en tabla de usuarios');
            
            // Verificar si el usuario está activo
            if (!adminUser.isActive()) {
                console.log('Usuario inactivo:', email);
                return res.status(403).json({
                    error: 'Cuenta inactiva',
                    code: 'AUTH_INACTIVE_ACCOUNT',
                    details: {
                        type: 'auth',
                        action: 'sign_in',
                        reason: 'inactive_account'
                    },
                    message: 'Tu cuenta está inactiva. Por favor, contacta al administrador del sistema.'
                });
            }

            // Verificar que la contraseña existe
            if (!adminUser.password) {
                console.error('Error: Usuario encontrado pero no tiene contraseña almacenada');
                return res.status(500).json({
                    error: 'Error de configuración',
                    message: 'Error en la configuración del usuario'
                });
            }

            // Verificar la contraseña hasheada
            console.log('Verificando contraseña...');
            const isValidPassword = await passwordUtils.verifyPassword(password, adminUser.password);
            
            if (!isValidPassword) {
                console.log('Contraseña inválida para el usuario');
                return res.status(401).json({ 
                    error: 'Credenciales inválidas',
                    code: 'AUTH_INVALID_CREDENTIALS',
                    details: {
                        type: 'auth',
                        action: 'sign_in',
                        reason: 'invalid_credentials'
                    },
                    message: 'Email o contraseña incorrectos'
                });
            }

            // Crear sesión en Supabase Auth
            console.log('Creando sesión en Supabase Auth...');
            const { data, error: authError } = await auth.signIn(email, password);

            if (authError) {
                console.error('Error en autenticación Supabase:', authError);
                throw authError;
            }

            console.log('Sesión creada exitosamente');
            return res.json({
                token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
                user: {
                    id: adminUser.id,
                    email: adminUser.email,
                    nombre: adminUser.nombre,
                    role: 'admin',
                    status: adminUser.status
                }
            });
        }

        // Si no es admin, buscar en la tabla de trabajadores
        console.log('Buscando usuario en tabla de trabajadores...');
        let trabajador = null;
        try {
            trabajador = await Trabajador.findByEmail(email);
        } catch (error) {
            if (error.code !== 'PGRST116') {
                throw error;
            }
            console.log('Usuario no encontrado en tabla de trabajadores');
        }

        if (trabajador) {
            console.log('Usuario encontrado en tabla de trabajadores');
            
            // Verificar si el trabajador está activo
            if (!trabajador.isActive()) {
                console.log('Trabajador inactivo:', email);
                return res.status(403).json({
                    error: 'Cuenta inactiva',
                    code: 'AUTH_INACTIVE_ACCOUNT',
                    details: {
                        type: 'auth',
                        action: 'sign_in',
                        reason: 'inactive_account'
                    },
                    message: 'Tu cuenta está inactiva. Por favor, contacta al administrador.'
                });
            }
            
            // Verificar la contraseña hasheada
            console.log('Verificando contraseña...');
            const isValidPassword = await trabajador.verifyPassword(password);
            
            if (!isValidPassword) {
                console.log('Contraseña inválida para el trabajador');
                return res.status(401).json({ 
                    error: 'Credenciales inválidas',
                    code: 'AUTH_INVALID_CREDENTIALS',
                    details: {
                        type: 'auth',
                        action: 'sign_in',
                        reason: 'invalid_credentials'
                    },
                    message: 'Email o contraseña incorrectos'
                });
            }

            // Crear sesión en Supabase Auth
            console.log('Creando sesión en Supabase Auth...');
            const { data: authData, error: authError } = await auth.signIn(email, password);

            if (authError) {
                console.error('Error en autenticación Supabase:', authError);
                throw authError;
            }

            console.log('Sesión creada exitosamente');
            return res.json({
                token: authData.session.access_token,
                refresh_token: authData.session.refresh_token,
                expires_at: authData.session.expires_at,
                user: {
                    id: trabajador.id,
                    email: trabajador.email,
                    nombre: trabajador.nombre,
                    role: 'trabajador',
                    status: trabajador.status,
                    usuario_id: trabajador.usuario_id,
                    phone: trabajador.phone
                }
            });
        }

        // Si no se encuentra en ninguna tabla
        console.log('Usuario no encontrado en ninguna tabla');
        return res.status(401).json({ 
            error: 'Usuario no encontrado',
            code: 'AUTH_USER_NOT_FOUND',
            details: {
                type: 'auth',
                action: 'sign_in',
                reason: 'user_not_found'
            },
            message: 'No existe ningún usuario registrado con este email'
        });

    } catch (error) {
        console.error('Error detallado en login:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        
        res.status(500).json({ 
            error: 'Error en el servidor',
            code: 'SERVER_ERROR',
            details: {
                type: 'server',
                action: 'sign_in',
                reason: 'internal_error'
            },
            message: 'Error procesando la solicitud. Por favor, inténtelo de nuevo más tarde.'
        });
    }
});

// Ruta de logout
router.post('/logout', authenticateJWT, async (req, res) => {
    try {
        await auth.signOut();
        res.json({ message: 'Sesión cerrada exitosamente' });
    } catch (error) {
        res.status(500).json({ 
            error: 'Error en el logout',
            message: error.message 
        });
    }
});

// Ruta para solicitar reset de contraseña
router.post('/reset-password', async (req, res) => {
    const { email } = req.body;

    try {
        await auth.resetPassword(email);
        res.json({ message: 'Password reset email sent' });
    } catch (error) {
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
                res.status(500).json({ 
                    error: 'Error en reset de contraseña',
                    message: error.message 
                });
        }
    }
});

// Ruta para actualizar contraseña
router.post('/update-password', async (req, res) => {
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

module.exports = router; 