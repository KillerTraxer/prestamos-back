const { auth } = require('../config/supabase');

class Expense {
    constructor(data) {
        this.id = data.id;
        this.trabajador_id = data.trabajador_id;
        this.monto = data.monto;
        this.descripcion = data.descripcion;
        this.tipo = data.tipo;
        this.fecha = data.fecha;
        this.created_at = data.created_at;
    }

    static async create(data) {
        const { data: result, error } = await auth.supabaseAdmin
            .from('gastos')
            .insert([{
                trabajador_id: data.trabajador_id,
                monto: data.monto,
                descripcion: data.descripcion,
                tipo: data.tipo,
                // fecha will be set by Supabase's now()
            }])
            .select()
            .single();

        if (error) throw error;
        return new Expense(result);
    }

    static async findAll(trabajadorId = null) {
        let query = auth.supabaseAdmin
            .from('gastos')
            .select('*')
            .order('created_at', { ascending: false });

        if (trabajadorId) {
            query = query.eq('trabajador_id', trabajadorId);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data.map(expense => new Expense(expense));
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('gastos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) throw new Error('Gasto no encontrado');

        return new Expense(data);
    }

    static async findByTrabajadorId(trabajadorId) {
        const { data, error } = await auth.supabaseAdmin
            .from('gastos')
            .select('*')
            .eq('trabajador_id', trabajadorId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data.map(expense => new Expense(expense));
    }

    static async findByType(tipo) {
        const { data, error } = await auth.supabaseAdmin
            .from('gastos')
            .select('*')
            .eq('tipo', tipo)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data.map(expense => new Expense(expense));
    }

    static async update(id, data) {
        const { data: result, error } = await auth.supabaseAdmin
            .from('gastos')
            .update({
                monto: data.monto,
                descripcion: data.descripcion,
                tipo: data.tipo,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return new Expense(result);
    }

    static async delete(id) {
        const { error } = await auth.supabaseAdmin
            .from('gastos')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    }
}

module.exports = Expense; 