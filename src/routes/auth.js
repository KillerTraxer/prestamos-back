const express = require('express');
const router = express.Router();
const { auth } = require('../config/supabase');
const { authenticateJWT } = require('../middleware/auth');
const passwordUtils = require('../utils/password');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');
const Client = require('../models/Client');

// Ruta de registro
router.post('/signup', async (req, res) => {
    const { email, password, nombre, role } = req.body;

    if (!email || !password || !nombre) {
        return res.status(400).json({
            error: 'Datos incompletos',
            details: 'El email, contraseña y nombre son requeridos'
        });
    }

    console.log('Iniciando proceso de registro para:', email);

    try {
        const { data: existingList, error: listError } =
            await auth.supabaseAdmin.auth.admin.listUsers({ filter: `email=eq.${email}` });
        if (listError) throw listError;

        if (existingList.users.length > 0) {
            return res.status(400).json({ error: 'Email ya registrado' });
        }

        const { data: signupData, error: signupError } = await auth.signUp(email, password, {
            nombre,
            role: role || 'user'
        });

        if (signupError || !signupData.user) {
            return res.status(400).json({ error: 'Error al registrar usuario', details: signupError?.message });
        }

        const newUserData = {
            email,
            nombre,
            role: role || 'user',
            auth_id: signupData.user.id,
            status: 'active',
            password
        };

        const user = role === 'trabajador'
            ? await Trabajador.create({ ...newUserData, usuario_id: '', phone: '' })
            : await User.create({ ...newUserData });

        return res.status(201).json({
            message: 'Usuario creado exitosamente',
            user: {
                id: user.id,
                email: user.email,
                nombre: user.nombre,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Error interno', message: error.message });
    }
});

// Ruta de login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }

    try {
        console.log('Iniciando proceso de login para:', email);

        const { data: loginData, error: loginError } = await auth.signIn(email, password);

        if (loginError) {
            console.error('Supabase signIn falló:', loginError);
            // Si el backend de Supabase está caído
            if (loginError.status >= 500) {
                return res
                    .status(502)
                    .json({ error: 'Auth service no disponible. Inténtalo más tarde.' });
            }
            // 400: credenciales inválidas
            return res
                .status(401)
                .json({ error: 'Email o contraseña incorrectos' });
        }

        // if (!loginData?.user) {
        //     // Raro, pero chequeo extra
        //     return res
        //         .status(401)
        //         .json({ error: 'Email o contraseña incorrectos' });
        // }

        const authId = loginData.user.id;

        let user = await User.findByAuthId?.(authId);
        let isTrabajador = false;

        if (!user) {
            user = await Trabajador.findByAuthId?.(authId);
            isTrabajador = true;
        }

        if (!user || !user.isActive()) {
            return res.status(403).json({ error: 'Cuenta inactiva o no encontrada' });
        }

        // Preparar respuesta
        const userData = {
            id: user.id,
            email: user.email,
            nombre: user.nombre,
            role: user.role || (isTrabajador ? 'trabajador' : 'admin'),
            status: user.status,
            workers_count: 0 // Valor por defecto para admins
        };

        if (isTrabajador) {
            userData.phone = user.phone;
            delete userData.workers_count; // Eliminamos workers_count para trabajadores
            // Obtener el conteo de clientes para el trabajador
            const clientes = await Client.findByWorkerId(user.id);
            userData.clients_count = clientes.length;
        } else {
            // Si es admin (User), obtener el conteo de trabajadores
            const trabajadores = await Trabajador.findAll({
                usuario_id: user.id
            });
            userData.workers_count = trabajadores.length;
            // Sumar todos los clients_count de los trabajadores
            userData.clients_count = trabajadores.reduce((total, trabajador) => total + (trabajador.clients_count || 0), 0);
        }

        return res.json({
            token: loginData.session.access_token,
            refresh_token: loginData.session.refresh_token,
            expires_at: loginData.session.expires_at,
            user: userData
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