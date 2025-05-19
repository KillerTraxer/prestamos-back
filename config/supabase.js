const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    throw new Error('Missing Supabase credentials. Please check your .env file.');
}

// Configuración común para los clientes
const clientOptions = {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
    },
    global: {
        headers: {
            'x-application-name': 'prestamos-back'
        }
    },
    db: {
        schema: 'public'
    },
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
};

// Cliente para operaciones públicas (frontend)
const supabaseClient = createClient(supabaseUrl, supabaseKey, clientOptions);

// Cliente para operaciones administrativas (backend)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    ...clientOptions,
    auth: {
        ...clientOptions.auth,
        persistSession: false // No necesitamos persistir la sesión en el backend
    }
});

// Funciones de autenticación
const auth = {
    supabaseAdmin,

    async signUp(email, password, userData) {
        try {
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: userData
            });

            if (error) {
                console.error('Error en signUp:', error);
                throw error;
            }
            return data;
        } catch (error) {
            console.error('Error detallado en signUp:', {
                message: error.message,
                code: error.code,
                details: error.details
            });
            throw error;
        }
    },

    async signIn(email, password) {
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                console.error('Error en signIn:', error);
                throw error;
            }
            return data;
        } catch (error) {
            console.error('Error detallado en signIn:', {
                message: error.message,
                code: error.code,
                details: error.details
            });
            throw error;
        }
    },

    async signOut() {
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) {
                console.error('Error en signOut:', error);
                throw error;
            }
        } catch (error) {
            console.error('Error detallado en signOut:', {
                message: error.message,
                code: error.code,
                details: error.details
            });
            throw error;
        }
    },

    async resetPassword(email) {
        try {
            console.log('Iniciando proceso de reset de contraseña para:', email);

            // Verificar si el email existe en la base de datos
            const { data: existingUser, error: dbError } = await supabaseAdmin
                .from('usuarios')
                .select('id, email')
                .eq('email', email)
                .single();

            if (dbError && dbError.code !== 'PGRST116') {
                console.error('Error verificando email en base de datos:', dbError);
                throw dbError;
            }

            if (!existingUser) {
                throw new Error('No existe una cuenta registrada con este email');
            }

            // Construir la URL de redirección
            const redirectUrl = process.env.FRONTEND_URL?.trim();
            if (!redirectUrl) {
                console.error('FRONTEND_URL no está configurada en las variables de entorno');
                throw new Error('Error de configuración: FRONTEND_URL no está definida');
            }

            const resetPasswordUrl = `${redirectUrl}/`;
            console.log('URL de redirección configurada:', resetPasswordUrl);

            // Enviar email de reset usando el cliente público
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: resetPasswordUrl
            });

            if (error) {
                console.error('Error enviando email de reset:', error);
                if (error.message?.includes('redirect URL')) {
                    throw new Error('La URL de redirección no está permitida en la configuración de Supabase');
                }
                throw error;
            }

            console.log('Email de reset enviado exitosamente a:', email);
            return { 
                message: 'Se ha enviado un email con instrucciones para resetear la contraseña',
                redirectUrl: resetPasswordUrl
            };
        } catch (error) {
            console.error('Error detallado en resetPassword:', {
                message: error.message,
                code: error.code,
                details: error.details,
                frontendUrl: process.env.FRONTEND_URL
            });

            if (error.message === 'No existe una cuenta registrada con este email') {
                throw error;
            }

            if (error.message?.includes('Invalid email')) {
                throw new Error('El formato del email no es válido');
            }

            if (error.message?.includes('redirect URL')) {
                throw new Error('La URL de redirección no está configurada correctamente en Supabase');
            }

            throw new Error('Error al procesar la solicitud de reset de contraseña');
        }
    },

    async updatePassword(newPassword, resetToken = null) {
        try {
            console.log('Iniciando actualización de contraseña');

            // Validar la contraseña
            if (!newPassword || newPassword.length < 6) {
                throw new Error('La contraseña debe tener al menos 6 caracteres');
            }

            let result;

            if (resetToken) {
                // Actualizar contraseña usando token de reset
                console.log('Actualizando contraseña usando token de reset');
                try {
                    result = await supabaseAdmin.auth.verifyOtp({
                        token_hash: resetToken,
                        type: 'recovery',
                        password: newPassword
                    });
                } catch (error) {
                    if (error.message?.includes('expired') || error.message?.includes('invalid')) {
                        throw new Error('El enlace de recuperación ha expirado o no es válido. Por favor, solicite un nuevo enlace de recuperación.');
                    }
                    throw error;
                }
            } else {
                // Actualizar contraseña usando sesión actual
                console.log('Actualizando contraseña usando sesión actual');
                result = await supabaseAdmin.auth.admin.updateUserById(
                    (await supabaseAdmin.auth.getUser()).data.user.id,
                    { password: newPassword }
                );
            }

            if (result.error) {
                console.error('Error en updatePassword:', result.error);
                throw result.error;
            }

            console.log('Contraseña actualizada exitosamente');
            return { 
                message: 'Contraseña actualizada exitosamente',
                details: resetToken ? 
                    'La contraseña ha sido actualizada usando el enlace de recuperación' : 
                    'La contraseña ha sido actualizada usando la sesión actual'
            };
        } catch (error) {
            console.error('Error detallado en updatePassword:', {
                message: error.message,
                code: error.code,
                details: error.details
            });

            if (error.message?.includes('expired') || error.message?.includes('invalid')) {
                throw new Error('El enlace de recuperación ha expirado o no es válido. Por favor, solicite un nuevo enlace de recuperación.');
            }

            if (error.message?.includes('Password should be at least')) {
                throw new Error('La contraseña debe tener al menos 6 caracteres');
            }

            if (error.message?.includes('Invalid password')) {
                throw new Error('La contraseña no cumple con los requisitos de seguridad');
            }

            throw new Error('Error al actualizar la contraseña');
        }
    },

    async getUser(token) {
        try {
            const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
            if (error) {
                console.error('Error en getUser:', error);
                throw error;
            }
            return user;
        } catch (error) {
            console.error('Error detallado en getUser:', {
                message: error.message,
                code: error.code,
                details: error.details
            });
            throw error;
        }
    }
};

module.exports = {
    supabase: supabaseClient,
    supabaseAdmin,
    auth
}; 