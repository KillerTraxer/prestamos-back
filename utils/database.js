const { supabase } = require('../config/supabase');

// Funciones de utilidad para manejar errores de Supabase
const handleError = (error, res) => {
    console.error('Error en la operación de base de datos:', error);
    res.status(500).json({ error: 'Error en la operación de base de datos' });
};

// Funciones para usuarios
const userQueries = {
    async findByEmail(email) {
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();
        
        if (error) throw error;
        return data;
    },

    async create(userData) {
        const { data, error } = await supabase
            .from('usuarios')
            .insert([userData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }
};

// Funciones para clientes
const clientQueries = {
    async findAll() {
        const { data, error } = await supabase
            .from('clientes')
            .select('*');
        
        if (error) throw error;
        return data;
    },

    async create(clientData) {
        const { data, error } = await supabase
            .from('clientes')
            .insert([clientData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async findById(id) {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        return data;
    },

    async findByWorkerId(workerId) {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('trabajador_id', workerId);
        
        if (error) throw error;
        return data;
    },

    async update(id, updateData) {
        const { data, error } = await supabase
            .from('clientes')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async delete(id) {
        const { error } = await supabase
            .from('clientes')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        return true;
    }
};

// Funciones para multas
const multaQueries = {
    async create(multaData) {
        const { data, error } = await supabase
            .from('multas')
            .insert([multaData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async findByClientId(clientId) {
        const { data, error } = await supabase
            .from('multas')
            .select('*')
            .eq('cliente_id', clientId);
        
        if (error) throw error;
        return data;
    }
};

// Funciones para abonos
const abonoQueries = {
    async create(abonoData) {
        const { data, error } = await supabase
            .from('abonos')
            .insert([abonoData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async findByClientId(clientId) {
        const { data, error } = await supabase
            .from('abonos')
            .select('*')
            .eq('cliente_id', clientId);
        
        if (error) throw error;
        return data;
    },

    async resetDailyAbonos() {
        const { error } = await supabase
            .from('abonos')
            .update({ abono_diario: 0 })
            .neq('abono_diario', 0);
        
        if (error) throw error;
        return true;
    },

    async resetWeeklyAbonos() {
        const { error } = await supabase
            .from('abonos')
            .update({ abono_semanal: 0 })
            .neq('abono_semanal', 0);
        
        if (error) throw error;
        return true;
    }
};

// Funciones para estadísticas
const statsQueries = {
    async getGeneralStats() {
        const { data, error } = await supabase
            .from('clientes')
            .select(`
                id,
                nombre,
                telefono,
                monto_inicial,
                fecha_inicio,
                fecha_termino,
                ocupacion,
                estado,
                direccion
            `);
        
        if (error) throw error;
        return data;
    },

    async getWorkerStats() {
        const { data, error } = await supabase
            .from('usuarios')
            .select(`
                id,
                nombre,
                clientes (
                    id,
                    abonos (
                        abono_diario,
                        abono_semanal
                    ),
                    total_multas_hoy,
                    total_multas_semanales
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
    abonoQueries,
    statsQueries
}; 