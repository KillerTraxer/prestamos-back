const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    throw new Error('Missing Supabase credentials. Please check your .env file.');
}

// Cliente para operaciones públicas (frontend)
const supabaseClient = createClient(supabaseUrl, supabaseKey);

// Cliente para operaciones administrativas (backend)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Funciones de autenticación
const auth = {
    async signUp(email, password, userData) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: userData
        });

        if (error) throw error;
        return data;
    },

    async signIn(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    },

    async signOut() {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
    },

    async resetPassword(email) {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL}/reset-password`
        });

        if (error) throw error;
    },

    async updatePassword(newPassword) {
        const { error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;
    },

    async getUser(token) {
        const { data: { user }, error } = await supabaseClient.auth.getUser(token);
        if (error) throw error;
        return user;
    }
};

module.exports = {
    supabase: supabaseClient,
    supabaseAdmin,
    auth
}; 