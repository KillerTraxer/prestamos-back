const { auth } = require('../config/supabase');

class Payment {
    constructor(data) {
        this.id = data.id;
        this.prestamo_id = data.prestamo_id;
        this.monto = data.monto;
        this.fecha = data.fecha;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    static async findAll() {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .select('*');
        if (error) throw error;
        return data.map(payment => new Payment(payment));
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data ? new Payment(data) : null;
    }

    static async findByLoanId(prestamoId) {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .select('*')
            .eq('prestamo_id', prestamoId)
            .order('fecha', { ascending: true });
        if (error) throw error;
        return data.map(payment => new Payment(payment));
    }

    static async getTotalByLoanId(prestamoId) {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .select('monto')
            .eq('prestamo_id', prestamoId);
        if (error) throw error;
        return data.reduce((total, payment) => total + parseFloat(payment.monto), 0);
    }

    static async create(paymentData) {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .insert([paymentData])
            .select()
            .single();
        if (error) throw error;
        return new Payment(data);
    }

    async update(updates) {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .update(updates)
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, new Payment(data));
        return this;
    }

    async delete() {
        const { error } = await auth.supabaseAdmin
            .from('abonos')
            .delete()
            .eq('id', this.id);
        if (error) throw error;
        return true;
    }

    // Métodos específicos para pagos
    static async getClientPaymentHistory(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .select('*')
            .eq('cliente_id', clienteId)
            .order('fecha', { ascending: false });
        if (error) throw error;
        return data.map(payment => new Payment(payment));
    }

    static async getTotalPaymentsByClient(clienteId) {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .select('monto')
            .eq('cliente_id', clienteId);
        if (error) throw error;
        return data.reduce((total, payment) => total + payment.monto, 0);
    }

    static async getDailyPayments(fecha) {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .select('*')
            .eq('fecha', fecha);
        if (error) throw error;
        return data.map(payment => new Payment(payment));
    }
}

module.exports = Payment; 