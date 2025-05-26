const { auth } = require('./supabase');

const handleError = (error, res) => {
    console.error('Error:', error);
    res.status(500).json({ 
        error: 'Error interno del servidor',
        message: error.message 
    });
};

const userQueries = {
    findAllWorkers: async () => {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .select('*')
            .eq('role', 'trabajador');
        if (error) throw error;
        return data;
    },
    findById: async (id) => {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    },
    findByEmail: async (email) => {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();
        if (error) throw error;
        return data;
    },
    create: async (userData) => {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .insert([userData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },
    update: async (id, updates) => {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },
    delete: async (id) => {
        const { error } = await auth.supabaseAdmin
            .from('usuarios')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
};

const clientQueries = {
    findAll: async () => {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .select('*');
        if (error) throw error;
        return data;
    },
    findById: async (id) => {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    },
    findByWorkerId: async (trabajadorId) => {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .select('*')
            .eq('trabajador_id', trabajadorId);
        if (error) throw error;
        return data;
    },
    create: async (clientData) => {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .insert([clientData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },
    update: async (id, updates) => {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },
    delete: async (id) => {
        const { error } = await auth.supabaseAdmin
            .from('clientes')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },
    createAbono: async (clienteId, monto, fecha, estado) => {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .insert([{
                cliente_id: clienteId,
                monto,
                fecha,
                estado
            }])
            .select();
        if (error) throw error;
        return data;
    },
    findAbonosByClientId: async (clienteId) => {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .select('*')
            .eq('cliente_id', clienteId);
        if (error) throw error;
        return data;
    }
};

const multaQueries = {
    findByClientId: async (clienteId) => {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('cliente_id', clienteId);
        if (error) throw error;
        return data;
    },
    create: async (multaData) => {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .insert([multaData])
            .select()
            .single();
        if (error) throw error;
        return data;
    }
};

const statsQueries = {
    getGeneralStats: async () => {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .select(`
                id,
                nombre,
                monto_inicial,
                fecha_inicio,
                fecha_termino,
                estado,
                multas:multas(count),
                abonos:abonos(sum)
            `);
        if (error) throw error;
        return data;
    },
    getWorkerStats: async () => {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .select(`
                id,
                nombre,
                clientes:clientes(
                    id,
                    nombre,
                    monto_inicial,
                    total_multas_hoy,
                    total_multas_semanales,
                    abonos:abonos(*)
                )
            `)
            .eq('role', 'trabajador');
        if (error) throw error;
        return data;
    }
};

module.exports = {
    handleError,
    userQueries,
    clientQueries,
    multaQueries,
    statsQueries
}; 