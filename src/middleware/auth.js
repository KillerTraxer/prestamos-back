const { auth } = require('../config/supabase');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');

const authenticateJWT = async (req, res, next) => {
    console.log('Iniciando proceso de autenticación...');
    const authHeader = req.headers.authorization;
    const refreshToken = req.headers['x-refresh-token'];

    if (!authHeader) {
        return res.status(401).json({
            error: 'No token provided',
            message: 'Se requiere un token de autenticación'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        console.log('Verificando token con Supabase...');
        const { data: { user }, error: authError } = await auth.supabaseAdmin.auth.getUser(token);

        // Si hay error de autenticación (token expirado o inválido)
        if (authError) {
            console.log('Token inválido o expirado, verificando refresh token...');
            
            // Si no hay refresh token, retornar error
            if (!refreshToken) {
                return res.status(401).json({
                    error: 'Token expired',
                    message: 'El token ha expirado y no se proporcionó refresh token',
                    requiresRefresh: true
                });
            }

            try {
                console.log('Intentando renovar sesión con refresh token...');
                const { data: refreshData, error: refreshError } = await auth.supabaseAdmin.auth.refreshSession({
                    refresh_token: refreshToken
                });

                if (refreshError || !refreshData?.session) {
                    console.error('Error al renovar sesión:', refreshError);
                    return res.status(401).json({
                        error: 'Invalid refresh token',
                        message: 'No se pudo renovar la sesión. Por favor, inicie sesión nuevamente.',
                        requiresLogin: true
                    });
                }

                // Sesión renovada exitosamente
                console.log('Sesión renovada exitosamente');
                const refreshedUser = refreshData.user;

                let dbUser = await User.findByAuthId(refreshedUser.id);
                if (!dbUser) dbUser = await Trabajador.findByAuthId(refreshedUser.id);

                if (!dbUser || !dbUser.isActive()) {
                    return res.status(403).json({
                        error: 'Cuenta inactiva',
                        message: 'Tu cuenta está inactiva o no existe en la base de datos'
                    });
                }

                // Devolver los nuevos tokens
                return res.status(401).json({
                    error: 'Token renovado',
                    message: 'Se ha renovado tu sesión. Usa los nuevos tokens para continuar.',
                    newTokens: {
                        access_token: refreshData.session.access_token,
                        refresh_token: refreshData.session.refresh_token
                    },
                    user: {
                        id: dbUser.id,
                        email: dbUser.email,
                        nombre: dbUser.nombre,
                        role: dbUser.role || 'trabajador',
                        status: dbUser.status
                    }
                });
            } catch (refreshError) {
                console.error('Error en el proceso de renovación:', refreshError);
                return res.status(401).json({
                    error: 'Refresh error',
                    message: 'Error al renovar la sesión. Por favor, inicie sesión nuevamente.',
                    requiresLogin: true
                });
            }
        }

        // Si el token es válido, continuar con la autenticación normal
        console.log('Token válido, buscando usuario en la base de datos...');
        let dbUser = await User.findByAuthId(user.id);
        if (!dbUser) dbUser = await Trabajador.findByAuthId(user.id);

        if (!dbUser || !dbUser.isActive()) {
            return res.status(403).json({
                error: 'Cuenta inactiva',
                message: 'Tu cuenta está inactiva o no existe en la base de datos'
            });
        }

        req.user = {
            id: dbUser.id,
            email: dbUser.email,
            nombre: dbUser.nombre,
            role: dbUser.role || 'trabajador',
            status: dbUser.status
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