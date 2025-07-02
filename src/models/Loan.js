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
        this.pago_diario = data.pago_diario;
        this.es_registro_manual = data.es_registro_manual;
        this.plazo_cuatro_semanas = data.plazo_cuatro_semanas;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
        this.deleted_at = data.deleted_at;
    }

    static async findAll() {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .select('*')
            .is('deleted_at', null); // Solo préstamos no eliminados
        if (error) throw error;
        return data.map(loan => new Loan(loan));
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('id', id)
            .is('deleted_at', null) // Solo préstamos no eliminados
            .single();
        if (error) throw error;
        return data ? new Loan(data) : null;
    }

    static async findByWorkerId(trabajadorId) {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('trabajador_id', trabajadorId)
            .is('deleted_at', null); // Solo préstamos no eliminados
        if (error) throw error;
        return data.map(loan => new Loan(loan));
    }

    static async findActiveByClientId(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('cliente_id', clienteId)
            .eq('estado', 'activo')
            .is('deleted_at', null) // Solo préstamos no eliminados
            .single();
        if (error) {
            if (error.code === 'PGRST116') return null; // No se encontró préstamo activo
            throw error;
        }
        return data ? new Loan(data) : null;
    }

    static async findByClientId(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('cliente_id', clienteId)
            .is('deleted_at', null); // Solo préstamos no eliminados
        if (error) throw error;
        return data.map(loan => new Loan(loan));
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

    // Soft delete - marca como eliminado en lugar de eliminar físicamente
    async softDelete() {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, new Loan(data));
        return this;
    }

    // Mantener el método delete original para compatibilidad (hard delete)
    async delete() {
        const { error } = await auth.supabaseAdmin
            .from('prestamos')
            .delete()
            .eq('id', this.id);
        if (error) throw error;
        return true;
    }

    // Método para restaurar préstamo eliminado (opcional)
    async restore() {
        const { data, error } = await auth.supabaseAdmin
            .from('prestamos')
            .update({ deleted_at: null })
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, new Loan(data));
        return this;
    }
}

module.exports = Loan; 