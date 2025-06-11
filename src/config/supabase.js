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
        return supabase.auth.resetPasswordForEmail(email);
    },
    updatePassword: async (newPassword, resetToken, email) => {
        if (resetToken) {
            return supabase.auth.verifyOtp({
                email,
                token: resetToken,
                type: 'recovery'
            });
        }
        return supabase.auth.updateUser({ password: newPassword });
    }
};

module.exports = { auth }; 