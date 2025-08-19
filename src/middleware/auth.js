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
            console.log('Token inválido o expirado. Sesión permanente: NO renovar ni limpiar sesión.');
            // return res.status(401).json({
            //     error: 'Token expired',
            //     message: 'Su sesión ha expirado. Por favor, inicie sesión nuevamente.',
            //     requiresLogin: true
            // });
            // --- Lógica de renovación y limpieza de sesión comentada para sesión permanente ---
            // if (!refreshTokenHeader) { ... }
            // try { ... } catch { ... }
            // --- Fin de lógica comentada ---
            return res.status(401).json({
                error: 'Token expired',
                message: 'Token inválido o expirado, pero la sesión es permanente. No se renueva ni se limpia.',
                requiresLogin: false
            });
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