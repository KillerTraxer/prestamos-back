const { auth } = require('../config/supabase');

class Movimiento {
    constructor(data) {
        this.id = data.id;
        this.tipo_movimiento = data.tipo_movimiento;
        this.monto = data.monto;
        this.fecha = data.fecha;
        this.usuario_id = data.usuario_id;
        this.referencia_id = data.referencia_id;
        this.created_at = data.created_at;
    }

    static async findAll() {
        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data.map(movimiento => new Movimiento(movimiento));
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data ? new Movimiento(data) : null;
    }

    static async findByUserId(usuarioId) {
        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .select('*')
            .eq('usuario_id', usuarioId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data.map(movimiento => new Movimiento(movimiento));
    }

    static async findByType(tipoMovimiento) {
        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .select('*')
            .eq('tipo_movimiento', tipoMovimiento)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data.map(movimiento => new Movimiento(movimiento));
    }

    static async findByReferenceId(referenciaId) {
        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .select('*')
            .eq('referencia_id', referenciaId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data.map(movimiento => new Movimiento(movimiento));
    }

    static async findByDateRange(fechaInicio, fechaFin) {
        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .select('*')
            .gte('fecha', fechaInicio)
            .lte('fecha', fechaFin)
            .order('fecha', { ascending: false });
        if (error) throw error;
        return data.map(movimiento => new Movimiento(movimiento));
    }

    static async create(movimientoData) {
        // Validar tipo de movimiento
        const tiposValidos = [
            'entrega_cliente',
            'abono_cliente', 
            'pago_multa',
            'pago_acumulado',
            'renovacion_prestamo',
            'liquidacion_prestamo'
        ];

        if (!tiposValidos.includes(movimientoData.tipo_movimiento)) {
            throw new Error(`Tipo de movimiento inválido: ${movimientoData.tipo_movimiento}`);
        }

        // Validar que el usuario_id existe en usuarios o trabajadores
        const usuarioExiste = await Movimiento._validateUserId(movimientoData.usuario_id);
        if (!usuarioExiste) {
            throw new Error(`Usuario no encontrado: ${movimientoData.usuario_id}`);
        }

        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .insert([movimientoData])
            .select()
            .single();
        if (error) throw error;
        return new Movimiento(data);
    }

    // Método privado para validar si el usuario existe
    static async _validateUserId(usuarioId) {
        try {
            // Buscar en la tabla usuarios
            const { data: usuario, error: userError } = await auth.supabaseAdmin
                .from('usuarios')
                .select('id')
                .eq('id', usuarioId)
                .single();

            if (!userError && usuario) {
                return true;
            }

            // Si no se encuentra en usuarios, buscar en trabajadores
            const { data: trabajador, error: workerError } = await auth.supabaseAdmin
                .from('trabajadores')
                .select('id')
                .eq('id', usuarioId)
                .single();

            if (!workerError && trabajador) {
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error validando usuario_id:', error);
            return false;
        }
    }

    async update(updates) {
        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .update(updates)
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, new Movimiento(data));
        return this;
    }

    async delete() {
        const { error } = await auth.supabaseAdmin
            .from('movimientos')
            .delete()
            .eq('id', this.id);
        if (error) throw error;
        return true;
    }

    // Métodos específicos para movimientos
    static async getTotalByType(tipoMovimiento, fechaInicio = null, fechaFin = null) {
        let query = auth.supabaseAdmin
            .from('movimientos')
            .select('monto')
            .eq('tipo_movimiento', tipoMovimiento);

        if (fechaInicio && fechaFin) {
            query = query.gte('fecha', fechaInicio).lte('fecha', fechaFin);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data.reduce((total, movimiento) => total + parseFloat(movimiento.monto), 0);
    }

    static async getTotalByUser(usuarioId, fechaInicio = null, fechaFin = null) {
        let query = auth.supabaseAdmin
            .from('movimientos')
            .select('monto')
            .eq('usuario_id', usuarioId);

        if (fechaInicio && fechaFin) {
            query = query.gte('fecha', fechaInicio).lte('fecha', fechaFin);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data.reduce((total, movimiento) => total + parseFloat(movimiento.monto), 0);
    }

    static async getMovementsByDate(fecha) {
        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .select('*')
            .eq('fecha', fecha)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data.map(movimiento => new Movimiento(movimiento));
    }

    static async getDailySummary(fecha) {
        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .select('tipo_movimiento, monto')
            .eq('fecha', fecha);
        if (error) throw error;

        // Agrupar por tipo de movimiento
        const summary = {};
        data.forEach(movimiento => {
            if (!summary[movimiento.tipo_movimiento]) {
                summary[movimiento.tipo_movimiento] = {
                    count: 0,
                    total: 0
                };
            }
            summary[movimiento.tipo_movimiento].count++;
            summary[movimiento.tipo_movimiento].total += parseFloat(movimiento.monto);
        });

        return summary;
    }
}

module.exports = Movimiento; 