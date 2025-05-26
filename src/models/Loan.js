const { auth } = require('../config/supabase');

class Loan {
    constructor(data) {
        this.id = data.id;
        this.cliente_id = data.cliente_id;
        this.trabajador_id = data.trabajador_id;
        this.monto = data.monto;
        this.interes = data.interes;
        this.fecha_inicio = data.fecha_inicio;
        this.fecha_fin = data.fecha_fin;
        this.estado = data.estado;
        this.observaciones = data.observaciones;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    static async findAll() {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .select('*');
        if (error) throw error;
        return data.map(loan => new Loan(loan));
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data ? new Loan(data) : null;
    }

    static async findByWorkerId(trabajadorId) {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('trabajador_id', trabajadorId);
        if (error) throw error;
        return data.map(loan => new Loan(loan));
    }

    static async findActiveByClientId(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('cliente_id', clienteId)
            .eq('estado', 'activo')
            .single();
        if (error) {
            if (error.code === 'PGRST116') return null; // No se encontró préstamo activo
            throw error;
        }
        return data ? new Loan(data) : null;
    }

    static async create(loanData) {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .insert([loanData])
            .select()
            .single();
        if (error) throw error;
        return new Loan(data);
    }

    async update(updates) {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .update(updates)
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, new Loan(data));
        return this;
    }

    async delete() {
        const { error } = await auth.supabaseAdmin
            .from('prestamos')
            .delete()
            .eq('id', this.id);
        if (error) throw error;
        return true;
    }
}

module.exports = Loan; 