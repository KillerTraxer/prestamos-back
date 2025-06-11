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

    // Configuración de signos para cada tipo de movimiento
    static getTipoMovimientoConfig() {
        return {
            'entrega_cliente': { signo: '-', descripcion: 'El sistema entrega dinero al cliente (inicio de préstamo)' },
            'abono_cliente': { signo: '+', descripcion: 'Cliente abona → entra dinero al sistema' },
            'pago_multa': { signo: '+', descripcion: 'Cliente paga una multa → dinero entra' },
            'pago_acumulado': { signo: '+', descripcion: 'Cliente paga multa acumulada → dinero entra' },
            'renovacion_prestamo': { signo: '-', descripcion: 'Se entrega nuevo préstamo → salida de dinero' },
            'liquidacion_prestamo': { signo: '+', descripcion: 'Cliente liquida todo → entra el resto del dinero' },
            'entrega_trabajador': { signo: '-', descripcion: 'Admin entrega efectivo al cobrador → sale dinero' },
            'gasto_operativo': { signo: '-', descripcion: 'Cobrador gasta en gasolina, comida, etc. → egreso' }
        };
    }

    // Método para aplicar el signo correcto al monto según el tipo de movimiento
    static aplicarSignoCorrector(tipoMovimiento, monto) {
        const config = this.getTipoMovimientoConfig();
        const tipoConfig = config[tipoMovimiento];
        
        if (!tipoConfig) {
            throw new Error(`Tipo de movimiento no configurado: ${tipoMovimiento}`);
        }
        
        // Convertir a número absoluto primero para evitar doble negativos
        const montoAbsoluto = Math.abs(parseFloat(monto));
        
        // Aplicar el signo correcto
        return tipoConfig.signo === '-' ? -montoAbsoluto : montoAbsoluto;
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
        const tiposValidosConfig = this.getTipoMovimientoConfig();
        const tiposValidos = Object.keys(tiposValidosConfig);

        if (!tiposValidos.includes(movimientoData.tipo_movimiento)) {
            throw new Error(`Tipo de movimiento inválido: ${movimientoData.tipo_movimiento}. Tipos válidos: ${tiposValidos.join(', ')}`);
        }

        // Validar que el usuario_id existe en usuarios o trabajadores
        const usuarioExiste = await Movimiento._validateUserId(movimientoData.usuario_id);
        if (!usuarioExiste) {
            throw new Error(`Usuario no encontrado: ${movimientoData.usuario_id}`);
        }

        // Aplicar el signo correcto al monto según el tipo de movimiento
        const montoConSigno = this.aplicarSignoCorrector(movimientoData.tipo_movimiento, movimientoData.monto);
        
        console.log(`Creando movimiento: ${movimientoData.tipo_movimiento}`);
        console.log(`Monto original: ${movimientoData.monto}`);
        console.log(`Monto con signo correcto: ${montoConSigno}`);

        const movimientoParaInsertar = {
            ...movimientoData,
            monto: montoConSigno
        };

        const { data, error } = await auth.supabaseAdmin
            .from('movimientos')
            .insert([movimientoParaInsertar])
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
        // Si se está actualizando el tipo de movimiento o el monto, aplicar el signo correcto
        if (updates.tipo_movimiento || updates.monto) {
            const tipoMovimiento = updates.tipo_movimiento || this.tipo_movimiento;
            const monto = updates.monto || this.monto;
            
            updates.monto = Movimiento.aplicarSignoCorrector(tipoMovimiento, monto);
            
            console.log(`Actualizando movimiento: ${tipoMovimiento}`);
            console.log(`Monto actualizado con signo correcto: ${updates.monto}`);
        }

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
        
        // Los montos ya tienen el signo correcto, solo sumar
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
        
        // Los montos ya tienen el signo correcto, solo sumar
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
            // Los montos ya tienen el signo correcto
            summary[movimiento.tipo_movimiento].total += parseFloat(movimiento.monto);
        });

        return summary;
    }

    // Método para obtener el balance total (considerando todos los signos)
    static async getBalanceTotal(fechaInicio = null, fechaFin = null) {
        let query = auth.supabaseAdmin
            .from('movimientos')
            .select('monto');

        if (fechaInicio && fechaFin) {
            query = query.gte('fecha', fechaInicio).lte('fecha', fechaFin);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        // Sumar todos los montos (que ya tienen el signo correcto)
        return data.reduce((balance, movimiento) => balance + parseFloat(movimiento.monto), 0);
    }

    // Método para obtener ingresos y egresos por separado
    static async getIngresosEgresos(fechaInicio = null, fechaFin = null) {
        let query = auth.supabaseAdmin
            .from('movimientos')
            .select('monto, tipo_movimiento');

        if (fechaInicio && fechaFin) {
            query = query.gte('fecha', fechaInicio).lte('fecha', fechaFin);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        const result = {
            ingresos: 0,
            egresos: 0,
            balance: 0
        };

        data.forEach(movimiento => {
            const monto = parseFloat(movimiento.monto);
            if (monto > 0) {
                result.ingresos += monto;
            } else if (monto < 0) {
                result.egresos += Math.abs(monto); // Mostrar egresos como positivos para claridad
            }
        });

        result.balance = result.ingresos - result.egresos;
        
        return result;
    }

    // Método para validar que un tipo de movimiento existe
    static esTipoMovimientoValido(tipoMovimiento) {
        const tiposValidos = Object.keys(this.getTipoMovimientoConfig());
        return tiposValidos.includes(tipoMovimiento);
    }

    // Método para obtener la descripción de un tipo de movimiento
    static getDescripcionTipoMovimiento(tipoMovimiento) {
        const config = this.getTipoMovimientoConfig();
        return config[tipoMovimiento]?.descripcion || 'Tipo de movimiento desconocido';
    }

    // Método para obtener el signo de un tipo de movimiento
    static getSignoTipoMovimiento(tipoMovimiento) {
        const config = this.getTipoMovimientoConfig();
        return config[tipoMovimiento]?.signo || '+';
    }
}

module.exports = Movimiento; 