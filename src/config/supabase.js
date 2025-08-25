const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const auth = {
    supabase,
    supabaseAdmin,
    signUp: async (email, password, metadata) => {
        return supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                ...metadata,
                name: metadata.nombre,
                full_name: metadata.nombre
            }
        });
    },
    signIn: async (email, password) => {
        return supabase.auth.signInWithPassword({ email, password });
    },
    signOut: async (token = null) => {
        if (token) {
            // Intentar invalidar una sesión específica usando el token
            try {
                // Primero intentar obtener el usuario del token para invalidar su sesión
                const { data: { user }, error: getUserError } = await supabaseAdmin.auth.getUser(token);
                if (!getUserError && user) {
                    // Invalidar todas las sesiones del usuario
                    const { error: signOutError } = await supabaseAdmin.auth.signOut(user.id, 'global');
                    if (signOutError) {
                        console.warn('Error al invalidar sesión específica:', signOutError);
                    }
                }
            } catch (error) {
                console.warn('Error procesando signOut específico:', error);
            }
        }
        
        // Hacer signOut general como respaldo
        return supabase.auth.signOut();
    },
    resetPassword: async (email) => {
        try {
            console.log('Iniciando proceso de reset de contraseña para:', email);

            // Verificar si el email existe en la base de datos
            let existingUser = null;
            
            // Primero buscar en la tabla usuarios
            const { data: userData, error: userError } = await supabaseAdmin
                .from('usuarios')
                .select('id, email')
                .eq('email', email)
                .single();
            
            if (!userError && userData) {
                existingUser = userData;
            } else {
                // Si no está en usuarios, buscar en trabajadores
                const { data: workerData, error: workerError } = await supabaseAdmin
                    .from('trabajadores')
                    .select('id, email')
                    .eq('email', email)
                    .single();
                
                if (!workerError && workerData) {
                    existingUser = workerData;
                }
            }

            if (!existingUser) {
                const error = new Error('No existe una cuenta registrada con este email');
                error.code = 'AUTH_EMAIL_NOT_FOUND';
                error.details = {
                    type: 'auth',
                    action: 'reset_password',
                    reason: 'email_not_registered'
                };
                throw error;
            }

            // Enviar email de reset usando el cliente público
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: process.env.FRONTEND_URL || 'http://localhost:3001'
            });

            if (error) {
                console.error('Error enviando email de reset:', error);
                if (error.message?.includes('redirect URL')) {
                    const customError = new Error('La URL de redirección no está configurada correctamente en Supabase');
                    customError.code = 'AUTH_INVALID_REDIRECT';
                    customError.details = {
                        type: 'auth',
                        action: 'reset_password',
                        reason: 'invalid_redirect_url'
                    };
                    throw customError;
                }
                throw error;
            }

            console.log('Email de reset enviado exitosamente a:', email);
            return { 
                message: 'Se ha enviado un email con instrucciones para resetear la contraseña'
            };
        } catch (error) {
            console.error('Error detallado en resetPassword:', {
                message: error.message,
                code: error.code || 'AUTH_UNKNOWN_ERROR',
                details: error.details || {
                    type: 'auth',
                    action: 'reset_password',
                    reason: 'unknown'
                }
            });

            if (error.message === 'No existe una cuenta registrada con este email') {
                throw error; // Ya tiene el código y detalles personalizados
            }

            if (error.message?.includes('Invalid email')) {
                const customError = new Error('El formato del email no es válido');
                customError.code = 'AUTH_INVALID_EMAIL';
                customError.details = {
                    type: 'auth',
                    action: 'reset_password',
                    reason: 'invalid_email_format'
                };
                throw customError;
            }

            // Error genérico para otros casos
            const genericError = new Error('Error al procesar la solicitud de reset de contraseña');
            genericError.code = 'AUTH_RESET_ERROR';
            genericError.details = {
                type: 'auth',
                action: 'reset_password',
                reason: 'unknown_error'
            };
            throw genericError;
        }
    },
    refreshSession: async (refreshToken) => {
        try {
            console.log('🔄 Refrescando sesión con Supabase...');
            
            // Usar el cliente público para refresh (el admin no tiene refreshSession)
            const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
            
            if (error) {
                console.error('❌ Error en refresh de Supabase:', error.message);
                throw error;
            }
            
            if (!data?.session) {
                throw new Error('No se obtuvo sesión válida del refresh');
            }
            
            console.log('✅ Sesión refrescada exitosamente en Supabase');
            return { data, error: null };
        } catch (error) {
            console.error('❌ Error en refreshSession:', error);
            return { data: null, error };
        }
    },
    updatePassword: async (newPassword, resetToken, email) => {
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
                if (!email) {
                    throw new Error('Se requiere el email para actualizar la contraseña con token de reset');
                }
                
                result = await supabase.auth.verifyOtp({
                    email,
                    token: resetToken,
                    type: 'recovery'
                });
                
                if (result.error) {
                    console.error('Error en verifyOtp:', result.error);
                    if (result.error.message?.includes('expired') || result.error.message?.includes('invalid')) {
                        throw new Error('El enlace de recuperación ha expirado o no es válido. Por favor, solicite un nuevo enlace de recuperación.');
                    }
                    throw result.error;
                }
                
                // Después de verificar el token, actualizar la contraseña
                const { error: updateError } = await supabase.auth.updateUser({
                    password: newPassword
                });
                
                if (updateError) {
                    console.error('Error actualizando contraseña después de verificar token:', updateError);
                    throw updateError;
                }
            } else {
                // Actualizar contraseña usando sesión actual
                console.log('Actualizando contraseña usando sesión actual');
                result = await supabase.auth.updateUser({ password: newPassword });
                
                if (result.error) {
                    console.error('Error en updateUser:', result.error);
                    throw result.error;
                }
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

            throw new Error(error.message || 'Error al actualizar la contraseña');
        }
    }
};

module.exports = { auth }; 