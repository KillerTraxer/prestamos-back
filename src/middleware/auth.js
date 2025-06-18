const { auth } = require('../config/supabase');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');
const SessionManager = require('../utils/session-manager');
const authCache = require('../utils/auth-cache');

const authenticateJWT = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const refreshTokenHeader = req.headers['x-refresh-token'];

    if (!authHeader) {
        return res.status(401).json({
            error: 'No token provided',
            message: 'Se requiere un token de autenticación',
            requiresLogin: true
        });
    }

    const token = authHeader.split(' ')[1];
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Rate limiting DESACTIVADO para desarrollo - Solo para casos extremos
    const maxRequests = 1000; // Límite muy alto, solo para casos extremos
    
    // Solo activar rate limiting en casos extremos
    if (!authCache.checkRateLimit(`auth:${clientIP}`, maxRequests)) {
        console.log(`Rate limit extremo excedido para IP: ${clientIP}`);
        return res.status(429).json({
            error: 'Too many requests',
            message: 'La aplicación está muy ocupada. Por favor espere un momento.',
            retryAfter: 1,
            suggestion: 'Evite refrescar la página repetidamente'
        });
    }

    try {
        // Verificar cache de token primero
        let cachedTokenVerification = authCache.getTokenVerification(token);
        let user, authError;
        
        if (cachedTokenVerification) {
            console.log('Token encontrado en cache');
            user = cachedTokenVerification.user;
            authError = cachedTokenVerification.error;
        } else {
            console.log('Verificando token con Supabase...');
            const result = await auth.supabaseAdmin.auth.getUser(token);
            user = result.data?.user;
            authError = result.error;
            
            // Guardar en cache solo si no hay error
            if (!authError && user) {
                authCache.setTokenVerification(token, { user, error: null });
            }
        }

        // Si hay error de autenticación (token expirado o inválido)
        if (authError) {
            console.log('Token inválido o expirado, intentando renovar con refresh token...');

            // Verificar si tenemos refresh token en las headers
            if (!refreshTokenHeader) {
                console.log('No se proporcionó refresh token en headers');
                return res.status(401).json({
                    error: 'Token expired',
                    message: 'Su sesión ha expirado. Por favor, inicie sesión nuevamente.',
                    requiresLogin: true
                });
            }

            try {
                console.log('Intentando renovar sesión con refresh token...');
                const { data: refreshData, error: refreshError } = await auth.supabaseAdmin.auth.refreshSession({
                    refresh_token: refreshTokenHeader
                });

                if (refreshError || !refreshData?.session) {
                    console.error('Error al renovar sesión:', refreshError);

                    // Verificar si es un error de refresh token ya usado
                    const isRefreshTokenUsed = refreshError?.message?.includes('Already Used') ||
                        refreshError?.message?.includes('already_used') ||
                        refreshError?.code === 'refresh_token_already_used';

                    // Usar limpieza suave para evitar errores adicionales
                    try {
                        const { data: { user }, error: getUserError } = await auth.supabaseAdmin.auth.getUser(token);
                        if (!getUserError && user) {
                            await SessionManager.softCleanupSession(user.id, 'refresh-failed');
                        }
                    } catch (cleanupError) {
                        console.warn('Error durante limpieza suave de sesión:', cleanupError);
                    }

                    const responseData = {
                        error: isRefreshTokenUsed ? 'Refresh token already used' : 'Invalid refresh token',
                        message: 'Su sesión ha expirado. Por favor, inicie sesión nuevamente.',
                        requiresLogin: true
                    };

                    if (refreshError) {
                        responseData.refreshError = {
                            message: refreshError.message,
                            code: refreshError.code,
                            status: refreshError.status
                        };
                    }

                    return res.status(401).json(responseData);
                }

                // Sesión renovada exitosamente
                console.log('Sesión renovada exitosamente');
                const refreshedUser = refreshData.user;

                console.log('DEBUG REFRESH - auth_id recibido:', refreshedUser.id);
                console.log('DEBUG REFRESH - refreshedUser completo:', {
                    id: refreshedUser.id,
                    email: refreshedUser.email,
                    created_at: refreshedUser.created_at
                });

                console.log('Buscando usuario renovado en BD con auth_id:', refreshedUser.id);

                // Agregar delay para evitar problemas de sincronización
                await new Promise(resolve => setTimeout(resolve, 100));

                let dbUser = await User.findByAuthId(refreshedUser.id);
                console.log('Resultado búsqueda en usuarios:', {
                    found: !!dbUser,
                    authIdBuscado: refreshedUser.id
                });

                if (!dbUser) {
                    console.log('No encontrado en usuarios, buscando en trabajadores...');
                    // Otro pequeño delay
                    await new Promise(resolve => setTimeout(resolve, 100));
                    dbUser = await Trabajador.findByAuthId(refreshedUser.id);
                    console.log('Resultado búsqueda en trabajadores:', {
                        found: !!dbUser,
                        authIdBuscado: refreshedUser.id
                    });
                }

                console.log('Resultado FINAL de búsqueda de usuario renovado:', {
                    found: !!dbUser,
                    email: dbUser?.email,
                    status: dbUser?.status,
                    authIdOriginal: refreshedUser.id
                });

                if (!dbUser || !dbUser.isActive()) {
                    console.log(`\n=== USUARIO NO ENCONTRADO EN BD TRAS REFRESH ===`);
                    console.log(`Auth ID: ${refreshedUser.id}`);
                    console.log(`Email: ${refreshedUser.email}`);
                    console.log(`Usuario encontrado: ${!!dbUser}`);
                    console.log(`Usuario activo: ${dbUser?.isActive()}`);

                    // Usar limpieza suave para evitar errores de JWT malformados
                    await SessionManager.softCleanupSession(refreshedUser.id, 'refresh-user-not-found');

                    return res.status(403).json({
                        error: 'Cuenta inactiva',
                        message: 'Tu cuenta está inactiva o no existe en la base de datos',
                        requiresLogin: true
                    });
                }

                // Construir datos del usuario según su tipo
                const userData = {
                    id: dbUser.id,
                    email: dbUser.email,
                    nombre: dbUser.nombre,
                    role: dbUser.role || 'trabajador',
                    status: dbUser.status,
                    auth_id: refreshedUser.id // Agregamos el auth_id del usuario renovado
                };

                // Agregar datos específicos según el tipo de usuario
                if (dbUser.role === 'trabajador' || !dbUser.role) {
                    userData.phone = dbUser.phone;
                    // Obtener conteo de clientes si es necesario
                    try {
                        const Client = require('../models/Client');
                        const clientes = await Client.findByWorkerId(dbUser.id);
                        userData.clients_count = clientes.length;
                    } catch (clientError) {
                        console.error('Error obteniendo clientes:', clientError);
                        userData.clients_count = 0;
                    }
                } else if (dbUser.role === 'admin') {
                    // Para admins, obtener conteos si es necesario
                    userData.workers_count = 0;
                    userData.clients_count = 0;
                }

                // Devolver los nuevos tokens con status 200 (exitoso) y flag especial
                return res.status(200).json({
                    message: 'Token renovado exitosamente',
                    tokenRefreshed: true,
                    newTokens: {
                        access_token: refreshData.session.access_token,
                        refresh_token: refreshData.session.refresh_token,
                        expires_at: refreshData.session.expires_at
                    },
                    user: userData
                });
            } catch (refreshError) {
                console.error('Error en el proceso de renovación:', refreshError);

                // Usar limpieza suave para evitar errores adicionales
                try {
                    const { data: { user }, error: getUserError } = await auth.supabaseAdmin.auth.getUser(token);
                    if (!getUserError && user) {
                        await SessionManager.softCleanupSession(user.id, 'refresh-catch-error');
                    }
                } catch (cleanupError) {
                    console.warn('Error durante limpieza suave de sesión:', cleanupError);
                }

                // Verificar si es un error de refresh token ya usado
                const isRefreshTokenUsed = refreshError?.message?.includes('Already Used') ||
                    refreshError?.message?.includes('already_used') ||
                    refreshError?.code === 'refresh_token_already_used';

                const responseData = {
                    error: isRefreshTokenUsed ? 'Refresh token already used' : 'Refresh error',
                    message: 'Su sesión ha expirado. Por favor, inicie sesión nuevamente.',
                    requiresLogin: true
                };

                if (refreshError) {
                    responseData.refreshError = {
                        message: refreshError.message,
                        code: refreshError.code,
                        status: refreshError.status
                    };
                }

                return res.status(401).json(responseData);
            }
        }

        // Si el token es válido, continuar con la autenticación normal
        console.log('Token válido, buscando usuario en la base de datos con auth_id:', user.id);
        
        // Verificar cache de usuario primero
        let dbUser = authCache.getUserData(user.id);
        
        if (dbUser) {
            console.log('Usuario encontrado en cache');
        } else {
            console.log('Usuario no en cache, consultando base de datos...');
            dbUser = await User.findByAuthId(user.id);
            if (!dbUser) {
                console.log('No encontrado en usuarios, buscando en trabajadores...');
                dbUser = await Trabajador.findByAuthId(user.id);
            }
            
            // Guardar en cache si se encontró el usuario
            if (dbUser && dbUser.isActive()) {
                authCache.setUserData(user.id, dbUser);
            }
        }
        
        console.log('Resultado de búsqueda de usuario normal:', {
            found: !!dbUser,
            email: dbUser?.email,
            status: dbUser?.status
        });

        if (!dbUser || !dbUser.isActive()) {
            console.log(`\n=== USUARIO NO ENCONTRADO EN BD (AUTH NORMAL) ===`);
            console.log(`Auth ID: ${user.id}`);
            console.log(`Email: ${user.email}`);
            console.log(`Usuario encontrado: ${!!dbUser}`);
            console.log(`Usuario activo: ${dbUser?.isActive()}`);

            // Usar limpieza suave para evitar errores de JWT malformados
            await SessionManager.softCleanupSession(user.id, 'auth-user-not-found');

            return res.status(403).json({
                error: 'Cuenta inactiva',
                message: 'Tu cuenta está inactiva o no existe en la base de datos',
                requiresLogin: true
            });
        }

        req.user = {
            id: dbUser.id,
            email: dbUser.email,
            nombre: dbUser.nombre,
            role: dbUser.role || 'trabajador',
            status: dbUser.status,
            auth_id: user.id // Agregamos el auth_id del usuario de Supabase
        };

        return next();
    } catch (error) {
        console.error('Error inesperado en autenticación:', error);
        return res.status(500).json({
            error: 'Error en el servidor',
            message: 'Error inesperado procesando la autenticación'
        });
    }
};

module.exports = { authenticateJWT }; 