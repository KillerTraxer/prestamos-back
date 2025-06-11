const express = require('express');
const router = express.Router();
const { auth } = require('../config/supabase');
const { authenticateJWT } = require('../middleware/auth');
const passwordUtils = require('../utils/password');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');
const Client = require('../models/Client');
const SessionManager = require('../utils/session-manager');
const SessionCleanupJob = require('../jobs/session-cleanup');
const AuthDebugger = require('../utils/debug-auth');

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
        return res.status(400).json({
            error: 'Datos incompletos',
            message: 'El email y contraseña son requeridos'
        });
    }

    try {
        console.log('Iniciando proceso de login para:', email);

        const { data: loginData, error: loginError } = await auth.signIn(email, password);

        if (loginError) {
            console.error('Supabase signIn falló:', {
                message: loginError.message,
                status: loginError.status,
                code: loginError.code
            });
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

        if (!loginData?.user || !loginData?.session) {
            console.error('Login exitoso pero sin datos de usuario o sesión:', loginData);
            return res
                .status(401)
                .json({ error: 'Error en autenticación' });
        }

        const authId = loginData.user.id;
        console.log('Usuario autenticado en Supabase con auth_id:', authId);

        // Función auxiliar para buscar usuario con reintento
        const findUserWithRetry = async (retries = 3, delay = 500) => {
            for (let i = 0; i < retries; i++) {
                if (i > 0) {
                    console.log(`Reintento ${i + 1}/${retries} después de ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                let user = await User.findByAuthId(authId);
                let isTrabajador = false;

                if (!user) {
                    console.log('No se encontró usuario admin, buscando trabajador...');
                    user = await Trabajador.findByAuthId(authId);
                    isTrabajador = true;
                }

                if (user) {
                    return { user, isTrabajador };
                }
            }
            return { user: null, isTrabajador: false };
        };

        // Intentar encontrar el usuario con reintentos
        const { user, isTrabajador } = await findUserWithRetry();

        console.log('Resultado de búsqueda de usuario:', {
            found: !!user,
            isTrabajador,
            userId: user?.id,
            userEmail: user?.email,
            userStatus: user?.status,
            isActive: user ? user.isActive() : 'N/A'
        });

        if (!user) {
            console.error('Usuario no encontrado en base de datos con auth_id:', authId);
            
            // Intentar limpiar la sesión problemática usando SessionManager
            await SessionManager.cleanupProblematicSession(authId, 'user-not-found-in-db');
            
            return res.status(403).json({ 
                error: 'Cuenta no encontrada',
                message: 'La cuenta no existe en la base de datos. La sesión ha sido limpiada, por favor intente nuevamente.',
                requiresLogin: true
            });
        }

        if (!user.isActive()) {
            console.error('Usuario encontrado pero inactivo:', {
                userId: user.id,
                email: user.email,
                status: user.status
            });
            
            // También limpiar sesión para usuarios inactivos usando SessionManager
            await SessionManager.cleanupProblematicSession(authId, 'user-inactive');
            
            return res.status(403).json({ 
                error: 'Cuenta inactiva',
                message: 'Su cuenta está inactiva. Contacte al administrador.',
                requiresLogin: true
            });
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
        console.log('Iniciando proceso de logout para usuario:', req.user?.email);
        
        // Obtener el token del header de autorización
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            
            try {
                // Usar la función mejorada de signOut
                const { error: signOutError } = await auth.signOut(token);
                if (signOutError) {
                    console.warn('Error al invalidar sesión:', signOutError);
                    // Continuar con el logout aunque falle la invalidación de Supabase
                }
            } catch (signOutError) {
                console.warn('Error al intentar invalidar la sesión:', signOutError);
                // Continuar con el logout aunque falle
            }
        }

        console.log('Logout completado exitosamente');
        res.json({ 
            message: 'Sesión cerrada exitosamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error en logout:', error);
        // Incluso si hay error, devolver éxito para permitir logout en el frontend
        res.json({ 
            message: 'Sesión cerrada (con advertencias)',
            warning: 'Hubo un problema al invalidar la sesión en el servidor',
            timestamp: new Date().toISOString()
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

// Ruta especial para limpiar sesiones problemáticas
router.post('/clear-session', async (req, res) => {
    const { email, auth_id } = req.body;
    
    if (!email && !auth_id) {
        return res.status(400).json({ error: 'Se requiere email o auth_id' });
    }
    
    try {
        let targetAuthId = auth_id;
        
        if (email && !auth_id) {
            console.log('Limpiando sesiones problemáticas para email:', email);
            
            // Buscar el usuario por email para obtener su auth_id
            let user = await User.findByEmail(email);
            let isTrabajador = false;
            
            if (!user) {
                user = await Trabajador.findByEmail(email);
                isTrabajador = true;
            }
            
            if (!user || !user.auth_id) {
                return res.status(404).json({ 
                    error: 'Usuario no encontrado',
                    message: 'No se encontró el usuario o no tiene auth_id'
                });
            }
            
            targetAuthId = user.auth_id;
            console.log('Usuario encontrado, limpiando sesiones para auth_id:', targetAuthId);
        } else {
            console.log('Limpiando sesiones para auth_id proporcionado:', targetAuthId);
        }
        
        // Usar SessionManager para limpiar las sesiones
        const success = await SessionManager.invalidateUserSessions(targetAuthId, email || 'unknown');
        
        console.log('Proceso de limpieza de sesiones completado');
        res.json({ 
            message: success ? 'Sesiones limpiadas exitosamente' : 'Sesiones limpiadas con advertencias',
            success: success,
            email: email || 'N/A',
            auth_id: targetAuthId,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error limpiando sesiones:', error);
        res.status(500).json({
            error: 'Error limpiando sesiones',
            message: 'Ocurrió un error al intentar limpiar las sesiones',
            details: error.message
        });
    }
});

// Ruta para limpiar todas las sesiones problemáticas (mantenimiento)
router.post('/clear-all-sessions', async (req, res) => {
    try {
        console.log('Iniciando limpieza global de sesiones...');
        
        // Obtener todos los usuarios de la base de datos
        const users = await User.findAll();
        const trabajadores = await Trabajador.findAll();
        
        let clearedCount = 0;
        let errorCount = 0;
        
        // Limpiar sesiones de usuarios admin usando SessionManager
        for (const user of users) {
            if (user.auth_id) {
                const success = await SessionManager.invalidateUserSessions(user.auth_id, user.email);
                if (success) {
                    clearedCount++;
                } else {
                    errorCount++;
                }
            }
        }
        
        // Limpiar sesiones de trabajadores usando SessionManager
        for (const trabajador of trabajadores) {
            if (trabajador.auth_id) {
                const success = await SessionManager.invalidateUserSessions(trabajador.auth_id, trabajador.email);
                if (success) {
                    clearedCount++;
                } else {
                    errorCount++;
                }
            }
        }
        
        console.log(`Limpieza global completada. Limpiados: ${clearedCount}, Errores: ${errorCount}`);
        
        res.json({
            message: 'Limpieza global de sesiones completada',
            stats: {
                cleared: clearedCount,
                errors: errorCount,
                total_users: users.length,
                total_workers: trabajadores.length
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error en limpieza global de sesiones:', error);
        res.status(500).json({
            error: 'Error en limpieza global',
            message: 'Ocurrió un error durante la limpieza global de sesiones',
            details: error.message
        });
    }
});

// Ruta de diagnóstico de sesiones (solo para debugging)
router.post('/session-debug', async (req, res) => {
    const { email, auth_id } = req.body;
    
    if (!email && !auth_id) {
        return res.status(400).json({ error: 'Se requiere email o auth_id' });
    }
    
    try {
        let targetAuthId = auth_id;
        let dbUser = null;
        
        if (email && !auth_id) {
            // Buscar el usuario por email
            dbUser = await User.findByEmail(email);
            if (!dbUser) {
                dbUser = await Trabajador.findByEmail(email);
            }
            
            if (!dbUser) {
                return res.json({
                    email,
                    found_in_db: false,
                    message: 'Usuario no encontrado en la base de datos'
                });
            }
            
            targetAuthId = dbUser.auth_id;
        }
        
        // Obtener información de debug de la sesión
        const authInfo = await SessionManager.getSessionDebugInfo(targetAuthId);
        
        // Si tenemos email pero no usuario de BD, buscarlo
        if (!dbUser && targetAuthId) {
            dbUser = await User.findByAuthId(targetAuthId);
            if (!dbUser) {
                dbUser = await Trabajador.findByAuthId(targetAuthId);
            }
        }
        
        const debugInfo = {
            email: email || dbUser?.email || 'unknown',
            auth_id: targetAuthId,
            db_user: dbUser ? {
                id: dbUser.id,
                email: dbUser.email,
                nombre: dbUser.nombre,
                status: dbUser.status,
                role: dbUser.role,
                is_active: dbUser.isActive()
            } : null,
            auth_info: authInfo,
            consistency: {
                user_exists_in_db: !!dbUser,
                user_exists_in_auth: authInfo.exists,
                emails_match: dbUser?.email === authInfo.user?.email,
                is_consistent: !!dbUser && authInfo.exists && dbUser.email === authInfo.user?.email
            },
            timestamp: new Date().toISOString()
        };
        
        res.json(debugInfo);
        
    } catch (error) {
        console.error('Error en debug de sesión:', error);
        res.status(500).json({
            error: 'Error en diagnóstico',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Ruta para ejecutar limpieza automática de sesiones (mantenimiento)
router.post('/cleanup-sessions', async (req, res) => {
    const { type = 'full' } = req.body;
    
    try {
        console.log(`Iniciando limpieza de sesiones tipo: ${type}`);
        
        let stats;
        
        switch (type) {
            case 'orphaned':
                stats = await SessionCleanupJob.cleanupOrphanedSessions();
                break;
            case 'inactive':
                stats = await SessionCleanupJob.cleanupInactiveSessions();
                break;
            case 'full':
            default:
                stats = await SessionCleanupJob.fullCleanup();
                break;
        }
        
        res.json({
            message: `Limpieza de sesiones ${type} completada`,
            stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error en limpieza automática de sesiones:', error);
        res.status(500).json({
            error: 'Error en limpieza automática',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint temporal para diagnosticar el problema específico del refresh
router.post('/debug-refresh', async (req, res) => {
    const { auth_id } = req.body;
    
    if (!auth_id) {
        return res.status(400).json({ error: 'Se requiere auth_id' });
    }
    
    try {
        console.log(`\n=== INICIANDO DIAGNÓSTICO PARA: ${auth_id} ===`);
        
        // Ejecutar diagnóstico completo
        const diagnosis = await AuthDebugger.diagnoseUser(auth_id);
        
        // Ejecutar diagnóstico específico de refresh
        const refreshDiagnosis = await AuthDebugger.quickRefreshDiagnosis(auth_id);
        
        res.json({
            auth_id,
            timestamp: new Date().toISOString(),
            full_diagnosis: diagnosis,
            refresh_diagnosis: refreshDiagnosis,
            recommendation: refreshDiagnosis.issue === 'timing_issue' 
                ? 'Problema de timing - agregar delays en middleware'
                : refreshDiagnosis.issue === 'data_inconsistency'
                ? 'Problema de integridad de datos - verificar BD'
                : 'Usuario funcional'
        });
        
    } catch (error) {
        console.error('Error en diagnóstico de refresh:', error);
        res.status(500).json({
            error: 'Error ejecutando diagnóstico',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router; 