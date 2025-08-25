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

// Endpoint para refrescar token de acceso usando refresh_token
// DESACTIVADO: El frontend maneja su propio refresh con Supabase
// router.post('/refresh', async (req, res) => {
//     const { refresh_token } = req.body;
//     if (!refresh_token) {
//         return res.status(400).json({ error: 'Falta refresh_token' });
//     }

//     try {
//         console.log('🔄 Procesando refresh de token...');
//         console.log('Refresh token recibido:', refresh_token.substring(0, 20) + '...');
        
//         // Usar el método personalizado para refrescar la sesión
//         const { data, error } = await auth.refreshSession(refresh_token);
        
//         if (error) {
//             console.error('❌ Error en refresh:', error.message);
//             return res.status(401).json({ 
//                 error: 'No se pudo refrescar la sesión',
//                 details: error.message 
//             });
//         }

//         if (!data?.session) {
//             console.error('❌ No se obtuvo sesión en refresh');
//             return res.status(401).json({ error: 'No se obtuvo sesión válida' });
//         }

//         const { access_token, refresh_token: newRefreshToken, expires_at } = data.session;
        
//         console.log('✅ Token refrescado exitosamente');
//         console.log('Nuevo access token:', access_token.substring(0, 20) + '...');
        
//         return res.json({
//             token: access_token,
//             refresh_token: newRefreshToken,
//             expires_at
//         });
//     } catch (e) {
//         console.error('❌ Error inesperado en /auth/refresh:', e);
//         return res.status(500).json({ 
//             error: 'Error al refrescar token',
//             details: e.message 
//         });
//     }
// });

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
            
            // En lugar de limpiar la sesión inmediatamente, verificar si el usuario realmente existe en Auth
            const userExistsInAuth = await SessionManager.userExistsInAuth(authId);
            
            if (userExistsInAuth) {
                console.log('Usuario existe en Auth pero no en BD - posible problema de sincronización');
                // Usar limpieza suave en lugar de agresiva para permitir reintento
                await SessionManager.softCleanupSession(authId, 'user-not-found-in-db-but-exists-auth');
                
                return res.status(403).json({ 
                    error: 'Cuenta no encontrada',
                    message: 'Hubo un problema de sincronización. Por favor, intente iniciar sesión nuevamente.',
                    requiresLogin: true,
                    canRetry: true // Indica que puede reintentar
                });
            } else {
                // Usuario realmente no existe en Auth, limpieza normal
                await SessionManager.cleanupProblematicSession(authId, 'user-not-found-in-db');
                
                return res.status(403).json({ 
                    error: 'Cuenta no encontrada',
                    message: 'La cuenta no existe en la base de datos. La sesión ha sido limpiada, por favor intente nuevamente.',
                    requiresLogin: true
                });
            }
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

        // Actualizar user_metadata en Supabase con los conteos
        try {
            const metadataToUpdate = {
                nombre: userData.nombre,
                role: userData.role,
                id: userData.id
            };

            // Agregar conteos según el rol
            if (isTrabajador) {
                metadataToUpdate.clients_count = userData.clients_count;
            } else {
                metadataToUpdate.workers_count = userData.workers_count;
                metadataToUpdate.clients_count = userData.clients_count;
            }

            const { error: updateError } = await auth.supabaseAdmin.auth.admin.updateUserById(
                authId,
                { user_metadata: metadataToUpdate }
            );

            if (updateError) {
                console.error('Error actualizando user_metadata en Supabase:', updateError);
                // No fallar el login si hay error actualizando metadata, solo loggear
            } else {
                console.log('User metadata actualizado exitosamente en Supabase:', metadataToUpdate);
            }
        } catch (metadataError) {
            console.error('Error en actualización de user_metadata:', metadataError);
            // No fallar el login si hay error actualizando metadata, solo loggear
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
        
        // NOTA: Sesión permanente. No limpiar ni invalidar sesiones automáticamente.
        // Comentar lógica de limpieza/invalidación automática si existiera.
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

// Ruta de diagnóstico específico para investigar el problema del auth_id
router.post('/debug-auth-id', async (req, res) => {
    const { auth_id, email } = req.body;
    
    if (!auth_id && !email) {
        return res.status(400).json({ error: 'Se requiere auth_id o email' });
    }
    
    try {
        console.log(`\n=== DIAGNÓSTICO ESPECÍFICO PARA: ${auth_id || email} ===`);
        
        const diagnosticData = {
            input: { auth_id, email },
            timestamp: new Date().toISOString(),
            searches: {},
            raw_data: {},
            recommendations: []
        };
        
        // 1. Buscar en Auth de Supabase si tenemos auth_id
        if (auth_id) {
            try {
                const { data: { user: authUser }, error: authError } = await auth.supabaseAdmin.auth.admin.getUserById(auth_id);
                diagnosticData.supabase_auth = {
                    exists: !authError && !!authUser,
                    error: authError?.message || null,
                    user_data: authUser ? {
                        id: authUser.id,
                        email: authUser.email,
                        created_at: authUser.created_at,
                        last_sign_in_at: authUser.last_sign_in_at
                    } : null
                };
            } catch (error) {
                diagnosticData.supabase_auth = {
                    exists: false,
                    error: error.message
                };
            }
        }
        
        // 2. Buscar en tabla usuarios
        try {
            const { data: usuarios, error: usuariosError } = await auth.supabaseAdmin
                .from('usuarios')
                .select('*')
                .or(auth_id ? `auth_id.eq.${auth_id}` : `email.eq.${email}`);
                
            diagnosticData.searches.usuarios = {
                error: usuariosError?.message || null,
                count: usuarios?.length || 0,
                data: usuarios || []
            };
        } catch (error) {
            diagnosticData.searches.usuarios = {
                error: error.message,
                count: 0,
                data: []
            };
        }
        
        // 3. Buscar en tabla trabajadores
        try {
            const { data: trabajadores, error: trabajadoresError } = await auth.supabaseAdmin
                .from('trabajadores')
                .select('*')
                .or(auth_id ? `auth_id.eq.${auth_id}` : `email.eq.${email}`);
                
            diagnosticData.searches.trabajadores = {
                error: trabajadoresError?.message || null,
                count: trabajadores?.length || 0,
                data: trabajadores || []
            };
        } catch (error) {
            diagnosticData.searches.trabajadores = {
                error: error.message,
                count: 0,
                data: []
            };
        }
        
        // 4. Si tenemos email, buscar todos los registros con ese email
        if (email) {
            try {
                const { data: allByEmail, error: allByEmailError } = await auth.supabaseAdmin
                    .from('usuarios')
                    .select('*')
                    .eq('email', email);
                    
                diagnosticData.raw_data.usuarios_by_email = {
                    error: allByEmailError?.message || null,
                    data: allByEmail || []
                };
            } catch (error) {
                diagnosticData.raw_data.usuarios_by_email = {
                    error: error.message,
                    data: []
                };
            }
            
            try {
                const { data: allWorkersByEmail, error: allWorkersByEmailError } = await auth.supabaseAdmin
                    .from('trabajadores')
                    .select('*')
                    .eq('email', email);
                    
                diagnosticData.raw_data.trabajadores_by_email = {
                    error: allWorkersByEmailError?.message || null,
                    data: allWorkersByEmail || []
                };
            } catch (error) {
                diagnosticData.raw_data.trabajadores_by_email = {
                    error: error.message,
                    data: []
                };
            }
        }
        
        // 5. Generar recomendaciones
        const totalFound = (diagnosticData.searches.usuarios?.count || 0) + (diagnosticData.searches.trabajadores?.count || 0);
        
        if (totalFound === 0) {
            if (diagnosticData.supabase_auth?.exists) {
                diagnosticData.recommendations.push('Usuario existe en Auth pero no en BD - necesita sincronización');
            } else {
                diagnosticData.recommendations.push('Usuario no existe ni en Auth ni en BD');
            }
        } else if (totalFound > 1) {
            diagnosticData.recommendations.push('Múltiples registros encontrados - posible duplicación');
        } else {
            diagnosticData.recommendations.push('Usuario encontrado correctamente');
        }
        
        // Log completo para debugging
        console.log('Diagnóstico completo:', JSON.stringify(diagnosticData, null, 2));
        
        res.json(diagnosticData);
        
    } catch (error) {
        console.error('Error en diagnóstico específico:', error);
        res.status(500).json({
            error: 'Error ejecutando diagnóstico',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint de prueba para verificar estado de autenticación
router.get('/test-auth', async (req, res) => {
    const authHeader = req.headers.authorization;
    const refreshTokenHeader = req.headers['x-refresh-token'];
    
    console.log('🧪 Test endpoint - Auth header:', authHeader ? 'Presente' : 'Ausente');
    console.log('🧪 Test endpoint - Refresh token:', refreshTokenHeader ? 'Presente' : 'Ausente');
    
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        console.log('🧪 Token recibido:', token.substring(0, 20) + '...');
        
        try {
            const { data: { user }, error } = await auth.supabaseAdmin.auth.getUser(token);
            if (error) {
                console.log('🧪 Token inválido:', error.message);
                return res.json({ 
                    status: 'invalid_token',
                    error: error.message,
                    hasRefreshToken: !!refreshTokenHeader
                });
            } else {
                console.log('🧪 Token válido para usuario:', user.email);
                return res.json({ 
                    status: 'valid_token',
                    user: { id: user.id, email: user.email },
                    hasRefreshToken: !!refreshTokenHeader
                });
            }
        } catch (e) {
            console.log('🧪 Error verificando token:', e.message);
            return res.json({ 
                status: 'error',
                error: e.message,
                hasRefreshToken: !!refreshTokenHeader
            });
        }
    }
    
    return res.json({ 
        status: 'no_token',
        hasRefreshToken: !!refreshTokenHeader
    });
});

// Ruta para sincronizar usuario desde Auth a BD
router.post('/sync-user-from-auth', async (req, res) => {
    const { auth_id, force = false } = req.body;
    
    if (!auth_id) {
        return res.status(400).json({ error: 'Se requiere auth_id' });
    }
    
    try {
        console.log(`\n=== SINCRONIZANDO USUARIO DESDE AUTH: ${auth_id} ===`);
        
        // 1. Verificar que el usuario existe en Auth
        const { data: { user: authUser }, error: authError } = await auth.supabaseAdmin.auth.admin.getUserById(auth_id);
        
        if (authError || !authUser) {
            return res.status(404).json({
                error: 'Usuario no encontrado en Auth',
                message: 'El auth_id proporcionado no existe en Supabase Auth',
                auth_error: authError?.message
            });
        }
        
        // 2. Verificar si ya existe en BD
        const existingUser = await User.findByAuthId(auth_id);
        const existingWorker = await Trabajador.findByAuthId(auth_id);
        
        if ((existingUser || existingWorker) && !force) {
            return res.status(409).json({
                error: 'Usuario ya existe en BD',
                message: 'El usuario ya existe en la base de datos. Use force=true para sobrescribir.',
                existing_in: existingUser ? 'usuarios' : 'trabajadores',
                user_data: existingUser || existingWorker
            });
        }
        
        // 3. Intentar determinar el tipo de usuario basado en el email
        const email = authUser.email;
        const isAdminEmail = email?.includes('admin') || email?.endsWith('@admin.com');
        
        // 4. Crear el usuario en la tabla apropiada
        let newUser;
        
        if (isAdminEmail) {
            // Crear como admin
            const userData = {
                email: authUser.email,
                nombre: authUser.user_metadata?.nombre || authUser.email?.split('@')[0] || 'Admin',
                role: 'admin',
                auth_id: authUser.id,
                status: 'active',
                password: 'synced_from_auth' // Placeholder ya que la auth real está en Supabase
            };
            
            newUser = await User.create(userData);
            
        } else {
            // Crear como trabajador
            const trabajadorData = {
                email: authUser.email,
                nombre: authUser.user_metadata?.nombre || authUser.email?.split('@')[0] || 'Trabajador',
                auth_id: authUser.id,
                status: 'active',
                phone: authUser.user_metadata?.phone || '0000000000',
                password: 'synced_from_auth', // Placeholder
                usuario_id: 1 // Asignar a admin por defecto - esto debe ajustarse según tu lógica
            };
            
            newUser = await Trabajador.create(trabajadorData);
        }
        
        console.log('Usuario sincronizado exitosamente:', {
            auth_id: authUser.id,
            email: authUser.email,
            type: isAdminEmail ? 'admin' : 'trabajador',
            db_id: newUser.id
        });
        
        res.json({
            message: 'Usuario sincronizado exitosamente desde Auth',
            auth_user: {
                id: authUser.id,
                email: authUser.email,
                created_at: authUser.created_at
            },
            db_user: {
                id: newUser.id,
                email: newUser.email,
                nombre: newUser.nombre,
                type: isAdminEmail ? 'admin' : 'trabajador'
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error sincronizando usuario:', error);
        res.status(500).json({
            error: 'Error sincronizando usuario',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Importar middleware de logging
const { requestLogger } = require('../middleware/request-limiter');

// Ruta para obtener los datos actualizados del usuario
router.get('/profile/updated-stats', authenticateJWT, requestLogger, async (req, res) => {
    try {
        console.log('Obteniendo estadísticas actualizadas para usuario:', req.user?.email);
        
        const userId = req.user.id;
        const userRole = req.user.role;
        
        // Verificar cache primero
        const authCache = require('../utils/auth-cache');
        let updatedStats = authCache.getUserStats(userId, userRole);
        
        if (updatedStats) {
            console.log('Estadísticas encontradas en cache');
            return res.json({
                message: 'Estadísticas actualizadas exitosamente (desde cache)',
                stats: updatedStats,
                cached: true
            });
        }
        
        // Si no está en cache, calcular
        updatedStats = {
            workers_count: 0,
            clients_count: 0
        };
        
        if (userRole === 'trabajador') {
            // Para trabajadores, obtener solo el conteo de clientes
            const clientes = await Client.findByWorkerId(userId);
            updatedStats.clients_count = clientes.length;
            // Los trabajadores no tienen workers_count
            delete updatedStats.workers_count;
        } else if (userRole === 'admin') {
            // Para admins, obtener el conteo de trabajadores y clientes totales
            const trabajadores = await Trabajador.findAll({
                usuario_id: userId
            });
            updatedStats.workers_count = trabajadores.length;
            
            // Obtener conteo total de clientes de todos los trabajadores de manera más eficiente
            let totalClients = 0;
            for (const trabajador of trabajadores) {
                const clientes = await Client.findByWorkerId(trabajador.id);
                totalClients += clientes.length;
            }
            updatedStats.clients_count = totalClients;
        }
        
        // Guardar en cache
        authCache.setUserStats(userId, userRole, updatedStats);
        
        // Actualizar user_metadata en Supabase con las estadísticas actualizadas
        try {
            const metadataToUpdate = {
                nombre: req.user.nombre,
                role: userRole,
                id: userId
            };

            // Agregar conteos según el rol
            if (userRole === 'trabajador') {
                metadataToUpdate.clients_count = updatedStats.clients_count;
            } else if (userRole === 'admin') {
                metadataToUpdate.workers_count = updatedStats.workers_count;
                metadataToUpdate.clients_count = updatedStats.clients_count;
            }

            const { error: updateError } = await auth.supabaseAdmin.auth.admin.updateUserById(
                req.user.auth_id,
                { user_metadata: metadataToUpdate }
            );

            if (updateError) {
                console.error('Error actualizando user_metadata en Supabase:', updateError);
                // No fallar la respuesta si hay error actualizando metadata, solo loggear
            } else {
                console.log('User metadata actualizado exitosamente en Supabase con estadísticas:', metadataToUpdate);
            }
        } catch (metadataError) {
            console.error('Error en actualización de user_metadata:', metadataError);
            // No fallar la respuesta si hay error actualizando metadata, solo loggear
        }
        
        console.log('Estadísticas actualizadas:', updatedStats);
        
        res.json({
            message: 'Estadísticas actualizadas exitosamente',
            stats: updatedStats,
            cached: false
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas actualizadas:', error);
        res.status(500).json({
            error: 'Error obteniendo estadísticas',
            message: error.message
        });
    }
});

// Ruta para verificar contraseña actual
router.post('/verify-password', authenticateJWT, async (req, res) => {
    const { currentPassword } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log('Verificación de contraseña iniciada para usuario:', {
        userId,
        userRole,
        hasCurrentPassword: !!currentPassword
    });

    // Validar que se proporcione la contraseña
    if (!currentPassword) {
        return res.status(400).json({
            error: 'Datos incompletos',
            message: 'La contraseña actual es requerida'
        });
    }

    try {
        console.log('Buscando usuario en base de datos...');
        // Buscar el usuario según su rol usando el ID de la base de datos
        let user;
        if (userRole === 'trabajador') {
            console.log('Buscando trabajador con ID:', userId);
            user = await Trabajador.findById(userId);
            console.log('Trabajador encontrado:', user ? 'SÍ' : 'NO');
        } else {
            console.log('Buscando usuario admin con ID:', userId);
            user = await User.findById(userId);
            console.log('Usuario admin encontrado:', user ? 'SÍ' : 'NO');
        }

        if (!user) {
            console.log('ERROR: Usuario no encontrado en base de datos');
            return res.status(404).json({
                error: 'Usuario no encontrado',
                message: 'No se encontró el usuario en la base de datos'
            });
        }

        console.log('Usuario encontrado, verificando contraseña actual...');
        
        // Verificar que la contraseña actual sea correcta
        console.log('Verificando contraseña actual...');
        console.log('Password hash en BD:', user.password ? 'EXISTE' : 'NO EXISTE');
        
        const isCurrentPasswordValid = await passwordUtils.verifyPassword(currentPassword, user.password);
        console.log('Contraseña actual válida:', isCurrentPasswordValid);
        
        if (!isCurrentPasswordValid) {
            console.log('ERROR: Contraseña actual incorrecta');
            return res.status(400).json({
                error: 'Contraseña incorrecta',
                message: 'La contraseña actual es incorrecta'
            });
        }

        console.log('Contraseña verificada exitosamente');

        // Respuesta exitosa
        res.status(200).json({
            message: 'Contraseña verificada exitosamente',
            verified: true
        });

    } catch (error) {
        console.error('Error verificando contraseña:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            error: 'Error interno del servidor',
            message: 'Ocurrió un error al verificar la contraseña. Inténtalo más tarde.'
        });
    }
});

// Ruta para cambiar contraseña
router.put('/change-password', authenticateJWT, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log('Cambio de contraseña iniciado para usuario:', {
        userId,
        userRole,
        hasCurrentPassword: !!currentPassword,
        hasNewPassword: !!newPassword
    });

    // Validar que se proporcionen ambas contraseñas
    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            error: 'Datos incompletos',
            message: 'La contraseña actual y la nueva contraseña son requeridas'
        });
    }

    try {
        console.log('Buscando usuario en base de datos...');
        // Buscar el usuario según su rol usando el ID de la base de datos
        let user;
        if (userRole === 'trabajador') {
            console.log('Buscando trabajador con ID:', userId);
            user = await Trabajador.findById(userId);
            console.log('Trabajador encontrado:', user ? 'SÍ' : 'NO');
        } else {
            console.log('Buscando usuario admin con ID:', userId);
            user = await User.findById(userId);
            console.log('Usuario admin encontrado:', user ? 'SÍ' : 'NO');
        }

        if (!user) {
            console.log('ERROR: Usuario no encontrado en base de datos');
            return res.status(404).json({
                error: 'Usuario no encontrado',
                message: 'No se encontró el usuario en la base de datos'
            });
        }

        console.log('Usuario encontrado, verificando contraseña actual...');

        // Verificar que la contraseña actual sea correcta
        console.log('Verificando contraseña actual...');
        console.log('Password hash en BD:', user.password ? 'EXISTE' : 'NO EXISTE');
        
        const isCurrentPasswordValid = await passwordUtils.verifyPassword(currentPassword, user.password);
        console.log('Contraseña actual válida:', isCurrentPasswordValid);
        
        if (!isCurrentPasswordValid) {
            console.log('ERROR: Contraseña actual incorrecta');
            return res.status(400).json({
                error: 'Contraseña incorrecta',
                message: 'La contraseña actual es incorrecta'
            });
        }

        console.log('Contraseña actual verificada, validando nueva contraseña...');

        // Validar la nueva contraseña
        console.log('Validando nueva contraseña...');
        const passwordValidation = passwordUtils.validatePassword(newPassword);
        console.log('Nueva contraseña válida:', passwordValidation.isValid);
        
        if (!passwordValidation.isValid) {
            console.log('ERROR: Nueva contraseña no válida:', passwordValidation.errors);
            const errorMessages = Object.values(passwordValidation.errors).filter(error => error !== null);
            return res.status(400).json({
                error: 'Contraseña no válida',
                message: 'La nueva contraseña no cumple con los requisitos de seguridad',
                details: errorMessages
            });
        }

        console.log('Nueva contraseña validada, verificando que sea diferente...');

        // Verificar que la nueva contraseña no sea igual a la actual
        console.log('Verificando que la nueva contraseña sea diferente...');
        const isSamePassword = await passwordUtils.verifyPassword(newPassword, user.password);
        console.log('Nueva contraseña es igual a la actual:', isSamePassword);
        
        if (isSamePassword) {
            console.log('ERROR: Nueva contraseña es igual a la actual');
            return res.status(400).json({
                error: 'Contraseña duplicada',
                message: 'La nueva contraseña debe ser diferente a la actual'
            });
        }

        console.log('Nueva contraseña es diferente, hasheando...');

        // Hashear la nueva contraseña
        console.log('Hasheando nueva contraseña...');
        const hashedNewPassword = await passwordUtils.hashPassword(newPassword);
        console.log('Nueva contraseña hasheada exitosamente');

        // Actualizar la contraseña en Supabase
        console.log('Actualizando contraseña en Supabase...');
        console.log('Auth ID para Supabase:', req.user.auth_id);
        
        const { error: supabaseError } = await auth.supabaseAdmin.auth.admin.updateUserById(
            req.user.auth_id,
            { password: newPassword }
        );

        if (supabaseError) {
            console.error('Error actualizando contraseña en Supabase:', supabaseError);
            return res.status(500).json({
                error: 'Error del servicio de autenticación',
                message: 'No se pudo actualizar la contraseña en el sistema de autenticación'
            });
        }

        console.log('Contraseña actualizada en Supabase exitosamente');

        // Actualizar la contraseña en la base de datos local
        console.log('Actualizando contraseña en base de datos local...');
        console.log('User ID para BD:', user.id);
        console.log('User Role:', userRole);
        
        if (userRole === 'trabajador') {
            console.log('Actualizando contraseña en tabla trabajadores...');
            await Trabajador.updatePassword(user.id, hashedNewPassword);
        } else {
            console.log('Actualizando contraseña en tabla usuarios...');
            await User.updatePassword(user.id, hashedNewPassword);
        }

        console.log('Contraseña actualizada en base de datos exitosamente');

        console.log('Contraseña actualizada exitosamente para usuario:', {
            userId: user.id,
            userRole,
            email: user.email
        });

        // Respuesta exitosa
        console.log('Enviando respuesta exitosa...');
        res.status(200).json({
            message: 'Contraseña actualizada exitosamente',
            success: true
        });

    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            error: 'Error interno del servidor',
            message: 'Ocurrió un error al cambiar la contraseña. Inténtalo más tarde.'
        });
    }
});

module.exports = router; 