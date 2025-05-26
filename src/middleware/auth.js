const { auth } = require('../config/supabase');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');

const authenticateJWT = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const refreshToken = req.headers['x-refresh-token']; // Nuevo header para el refresh token

    if (!authHeader) {
        return res.status(401).json({ 
            error: 'No token provided',
            message: 'Se requiere un token de autenticación'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Intentar verificar el token actual
        const { data: { user }, error: authError } = await auth.supabaseAdmin.auth.getUser(token);
        
        if (authError) {
            // Si hay error y tenemos refresh token, intentar renovar la sesión
            if (refreshToken) {
                try {
                    const { data: refreshData, error: refreshError } = await auth.supabaseAdmin.auth.refreshSession({
                        refresh_token: refreshToken
                    });

                    if (refreshError) throw refreshError;

                    // Si la renovación fue exitosa, devolver los nuevos tokens
                    if (refreshData && refreshData.session) {
                        return res.status(401).json({
                            error: 'Token expired',
                            message: 'Token expirado, se requiere renovación',
                            newTokens: {
                                access_token: refreshData.session.access_token,
                                refresh_token: refreshData.session.refresh_token
                            }
                        });
                    }
                } catch (refreshError) {
                    console.error('Error renovando token:', refreshError);
                    return res.status(401).json({ 
                        error: 'Invalid refresh token',
                        message: 'El token de renovación no es válido o ha expirado'
                    });
                }
            }

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

        // Primero buscar en la tabla de usuarios (admins)
        const adminUser = await User.findByEmail(user.email);

        if (adminUser) {
            // Verificar si el usuario está activo
            if (!adminUser.isActive()) {
                return res.status(403).json({ 
                    error: 'Cuenta inactiva',
                    message: 'Tu cuenta está inactiva. Por favor, contacta al administrador del sistema.'
                });
            }

            req.user = {
                id: adminUser.id,
                email: adminUser.email,
                nombre: adminUser.nombre,
                role: 'admin',
                status: adminUser.status
            };
            return next();
        }

        // Si no es admin, buscar en la tabla de trabajadores
        const trabajador = await Trabajador.findByEmail(user.email);

        if (trabajador) {
            // Verificar si el trabajador está activo
            if (!trabajador.isActive()) {
                return res.status(403).json({ 
                    error: 'Cuenta inactiva',
                    message: 'Tu cuenta está inactiva. Por favor, contacta al administrador.'
                });
            }

            req.user = {
                id: trabajador.id,
                email: trabajador.email,
                nombre: trabajador.nombre,
                role: 'trabajador',
                status: trabajador.status,
                usuario_id: trabajador.usuario_id,
                phone: trabajador.phone
            };
            return next();
        }

        // Si no se encuentra en ninguna tabla
        return res.status(401).json({ 
            error: 'Usuario no encontrado',
            message: 'El usuario no existe en la base de datos'
        });

    } catch (error) {
        console.error('Error en autenticación:', error);
        return res.status(500).json({ 
            error: 'Error en el servidor',
            message: 'Error procesando la autenticación'
        });
    }
};

module.exports = { authenticateJWT }; 