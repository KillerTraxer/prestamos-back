const { auth } = require('../config/supabase');

class Fine {
    constructor(data) {
        this.id = data.id;
        this.prestamo_id = data.prestamo_id;
        this.fecha = data.fecha;
        this.monto = data.monto;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    static async findAll() {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*');
        if (error) throw error;
        return data.map(fine => new Fine(fine));
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data ? new Fine(data) : null;
    }

    static async findByLoanId(prestamoId) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('prestamo_id', prestamoId)
            .order('fecha', { ascending: true });
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

    async delete() {
        const { error } = await auth.supabaseAdmin
            .from('multas')
            .delete()
            .eq('id', this.id);
        if (error) throw error;
        return true;
    }

    // Métodos específicos para multas
    static async getDailyFines(fecha) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('fecha', fecha);
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
            .lte('fecha', today.toISOString().split('T')[0]);
        if (error) throw error;
        return data.map(fine => new Fine(fine));
    }

    static async getTotalFinesByClient(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('monto')
            .eq('cliente_id', clienteId);
        if (error) throw error;
        return data.reduce((total, fine) => total + fine.monto, 0);
    }
}

module.exports = Fine; 