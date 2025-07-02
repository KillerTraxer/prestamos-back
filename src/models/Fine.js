const { auth } = require('../config/supabase');

class Fine {
    constructor(data) {
        this.id = data.id;
        this.prestamo_id = data.prestamo_id;
        this.fecha = data.fecha;
        this.monto = data.monto;
        this.estado = data.estado;
        this.cliente_id = data.cliente_id;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
        this.deleted_at = data.deleted_at;
    }

    static async findAll() {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .is('deleted_at', null); // Solo multas no eliminadas
        if (error) throw error;
        return data.map(fine => new Fine(fine));
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('id', id)
            .is('deleted_at', null) // Solo multas no eliminadas
            .single();
        if (error) throw error;
        return data ? new Fine(data) : null;
    }

    static async findByLoanId(prestamoId, filters = {}) {
        let query = auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('prestamo_id', prestamoId)
            .is('deleted_at', null); // Solo multas no eliminadas

        // Si vino filtro por estado, lo aplicamos
        if (filters.estado) {
            query = query.eq('estado', filters.estado);
        }

        const { data, error } = await query.order('fecha', { ascending: true });

        if (error) throw error;
        return data.map(fine => new Fine(fine));
    }

    static async findByClientId(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('cliente_id', clienteId)
            .is('deleted_at', null); // Solo multas no eliminadas
        if (error) throw error;
        return data.map(fine => new Fine(fine));
    }

    static async create(fineData) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .insert([fineData])
            .select()
            .single();
        if (error) throw error;
        return new Fine(data);
    }

    async update(updates) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .update(updates)
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, new Fine(data));
        return this;
    }

    // Soft delete - marca como eliminada en lugar de eliminar físicamente
    async softDelete() {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, new Fine(data));
        return this;
    }

    // Mantener el método delete original para compatibilidad (hard delete)
    async delete() {
        const { error } = await auth.supabaseAdmin
            .from('multas')
            .delete()
            .eq('id', this.id);
        if (error) throw error;
        return true;
    }

    // Método para restaurar multa eliminada (opcional)
    async restore() {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .update({ deleted_at: null })
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, new Fine(data));
        return this;
    }

    // Métodos específicos para multas
    static async getDailyFines(fecha) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('fecha', fecha)
            .is('deleted_at', null); // Solo multas no eliminadas
        if (error) throw error;
        return data.map(fine => new Fine(fine));
    }

    static async getWeeklyFines(clienteId) {
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);

        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('cliente_id', clienteId)
            .gte('fecha', sevenDaysAgo.toISOString().split('T')[0])
            .lte('fecha', today.toISOString().split('T')[0])
            .is('deleted_at', null); // Solo multas no eliminadas
        if (error) throw error;
        return data.map(fine => new Fine(fine));
    }

    static async getTotalFinesByClient(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('monto')
            .eq('cliente_id', clienteId)
            .is('deleted_at', null); // Solo multas no eliminadas
        if (error) throw error;
        return data.reduce((total, fine) => total + fine.monto, 0);
    }
}

module.exports = Fine; 