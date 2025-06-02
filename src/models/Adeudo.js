const { auth } = require('../config/supabase');

class Adeudo {
    constructor(data) {
        this.id = data.id;
        this.cliente_id = data.cliente_id;
        this.prestamo_id = data.prestamo_id;
        this.monto = data.monto;
        this.fecha = data.fecha;
        this.estado = data.estado || 'pendiente';
        this.created_at = data.created_at;
    }

    static async create(data) {
        const { data: result, error } = await auth.supabaseAdmin
            .from('adeudos')
            .insert([{
                cliente_id: data.cliente_id,
                prestamo_id: data.prestamo_id,
                monto: data.monto,
                fecha: data.fecha,
                estado: data.estado || 'pendiente'
            }])
            .select()
            .single();

        if (error) throw error;
        return new Adeudo(result);
    }

    static async findByLoanId(prestamoId, filters = {}) {
        let query = auth.supabaseAdmin
            .from('adeudos')
            .select('*')
            .eq('prestamo_id', prestamoId);

        if (filters.estado) {
            query = query.eq('estado', filters.estado);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data.map(row => new Adeudo(row));
    }

    static async findByClientId(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('adeudos')
            .select('*')
            .eq('cliente_id', clienteId);

        if (error) throw error;
        return data.map(row => new Adeudo(row));
    }

    static async findPendingByClientId(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('adeudos')
            .select('*')
            .eq('cliente_id', clienteId)
            .eq('estado', 'pendiente');

        if (error) throw error;
        return data.map(row => new Adeudo(row));
    }

    async update(data) {
        const { data: result, error } = await auth.supabaseAdmin
            .from('adeudos')
            .update({
                fecha: data.fecha,
                estado: data.estado,
                updated_at: new Date().toISOString()
            })
            .eq('id', this.id)
            .select()
            .single();

        if (error) throw error;
        return new Adeudo(result);
    }

    static async countByLoanId(prestamoId) {
        const { count, error } = await auth.supabaseAdmin
            .from('adeudos')
            .select('*', { count: 'exact', head: true })
            .eq('prestamo_id', prestamoId);

        if (error) throw error;
        return count;
    }
}

module.exports = Adeudo; 