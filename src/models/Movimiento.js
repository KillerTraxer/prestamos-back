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

    // Método para obtener movimientos financieros de un admin
    static async getFinancialMovementsByAdmin(adminId, fechaInicio = null, fechaFin = null) {
        try {
            // Primero obtener todos los trabajadores del admin
            const { data: trabajadores, error: trabajadoresError } = await auth.supabaseAdmin
                .from('trabajadores')
                .select('id, nombre')
                .eq('usuario_id', adminId);
            
            if (trabajadoresError) throw trabajadoresError;
            
            const trabajadorIds = trabajadores.map(t => t.id);
            const trabajadoresMap = trabajadores.reduce((map, t) => {
                map[t.id] = t.nombre;
                return map;
            }, {});
            
            // Crear consulta base para movimientos
            let query = auth.supabaseAdmin
                .from('movimientos')
                .select(`
                    id,
                    tipo_movimiento,
                    monto,
                    fecha,
                    usuario_id,
                    referencia_id,
                    created_at
                `);
            
            // Aplicar filtro de fechas si se proporcionan (fechas ya vienen en formato UTC)
            if (fechaInicio && fechaFin) {
                // Usar created_at para filtrar por fechas ya que es más preciso
                query = query.gte('created_at', fechaInicio).lte('created_at', fechaFin);
                console.log(`🔍 Filtro de fechas aplicado: ${fechaInicio} - ${fechaFin}`);
            }
            
            const { data: movimientos, error: movimientosError } = await query.order('created_at', { ascending: false });
            
            if (movimientosError) throw movimientosError;
            
            // Obtener los IDs de gastos para los movimientos de tipo gasto_operativo
            const gastosIds = movimientos
                .filter(m => m.tipo_movimiento === 'gasto_operativo' && m.referencia_id)
                .map(m => m.referencia_id);
            
            // Obtener información de gastos si hay IDs
            let gastosMap = {};
            if (gastosIds.length > 0) {
                const { data: gastos, error: gastosError } = await auth.supabaseAdmin
                    .from('gastos')
                    .select('id, descripcion, tipo')
                    .in('id', gastosIds);
                
                if (gastosError) {
                    console.warn('Error obteniendo gastos:', gastosError);
                } else {
                    gastosMap = gastos.reduce((map, gasto) => {
                        map[gasto.id] = gasto;
                        return map;
                    }, {});
                    console.log(`Obtenidos ${gastos.length} gastos para movimientos:`, gastos);
                }
            }
            
            // Filtrar movimientos según la lógica del admin y agregar nombres de trabajadores
            const movimientosFiltrados = movimientos.filter(movimiento => {
                // Si el usuario_id es de un trabajador del admin, incluir
                if (trabajadorIds.includes(movimiento.usuario_id)) {
                    return true;
                }
                
                // Si el usuario_id es el admin y es entrega_trabajador
                if (movimiento.usuario_id === adminId && movimiento.tipo_movimiento === 'entrega_trabajador') {
                    // Verificar que referencia_id sea de un trabajador suyo
                    return trabajadorIds.includes(movimiento.referencia_id);
                }
                
                return false;
            }).map(movimiento => {
                // Agregar el nombre del trabajador
                let nombreTrabajador = 'Sistema';
                
                if (movimiento.tipo_movimiento === 'entrega_trabajador') {
                    // Para entrega_trabajador, el trabajador está en referencia_id
                    nombreTrabajador = trabajadoresMap[movimiento.referencia_id] || 'Trabajador Desconocido';
                } else if (trabajadorIds.includes(movimiento.usuario_id)) {
                    // Para otros tipos, el trabajador está en usuario_id
                    nombreTrabajador = trabajadoresMap[movimiento.usuario_id] || 'Trabajador Desconocido';
                }
                
                // Agregar información del gasto si es tipo gasto_operativo
                let gastoInfo = null;
                if (movimiento.tipo_movimiento === 'gasto_operativo' && movimiento.referencia_id && gastosMap[movimiento.referencia_id]) {
                    const gasto = gastosMap[movimiento.referencia_id];
                    gastoInfo = {
                        gasto_descripcion: gasto.descripcion,
                        gasto_tipo: gasto.tipo
                    };
                }
                
                return {
                    ...movimiento,
                    nombre_trabajador: nombreTrabajador,
                    ...gastoInfo // Spread la información del gasto si existe
                };
            });
            
            // Retornar los movimientos con nombre_trabajador sin convertir a instancias de Movimiento
            // para preservar el campo nombre_trabajador
            return movimientosFiltrados;
        } catch (error) {
            console.error('Error obteniendo movimientos financieros del admin:', error);
            throw error;
        }
    }

    // Método para obtener resumen financiero de un admin
    static async getFinancialSummaryByAdmin(adminId, fechaInicio = null, fechaFin = null) {
        try {
            const movimientos = await this.getFinancialMovementsByAdmin(adminId, fechaInicio, fechaFin);
            
            let totalRecolecciones = 0;
            let totalGastos = 0;
            let totalSaldo = 0;
            let transacciones = [];
            
            // Debug: Log información de movimientos
            console.log(`Total movimientos encontrados: ${movimientos.length}`);
            console.log('Primeros 2 movimientos:', movimientos.slice(0, 2));
            console.log(`Rango de fechas: ${fechaInicio} - ${fechaFin}`);
            
            // Clasificar movimientos
            movimientos.forEach(movimiento => {
                const monto = parseFloat(movimiento.monto);
                const montoAbsoluto = Math.abs(monto);
                
                console.log(`Procesando movimiento: ${movimiento.tipo_movimiento}, monto: ${monto}, absoluto: ${montoAbsoluto}`);
                
                // Calcular el balance según la lógica correcta
                switch (movimiento.tipo_movimiento) {
                    // ✅ SUMAN al balance (ingresos que recolecta el trabajador)
                    case 'abono_cliente':
                    case 'pago_multa':
                    case 'pago_acumulado':
                    case 'liquidacion_prestamo':
                        totalSaldo += montoAbsoluto; // Sumar como valor positivo
                        totalRecolecciones += montoAbsoluto;
                        console.log(`  → Recolección: +${montoAbsoluto}, Total recolecciones: ${totalRecolecciones}`);
                        break;
                        
                    // ❌ RESTAN al balance (gastos que desembolsa el trabajador)
                    case 'gasto_operativo':
                    case 'entrega_cliente':
                    case 'renovacion_prestamo':
                        totalSaldo -= montoAbsoluto; // Restar del balance
                        totalGastos += montoAbsoluto; // Para mostrar en gastos
                        console.log(`  → Gasto: +${montoAbsoluto}, Total gastos: ${totalGastos}`);
                        break;
                        
                    // 💵 SUMAN al balance (dinero entregado por el admin al trabajador)
                    case 'entrega_trabajador':
                        totalSaldo += montoAbsoluto; // Sumar al balance (dinero entregado al trabajador)
                        console.log(`  → Entrega trabajador: +${montoAbsoluto}`);
                        break;
                }
                
                // TODOS los movimientos van al historial de transacciones
                const transaccion = {
                    id: movimiento.id,
                    type: this.mapTipoToFinanceType(movimiento.tipo_movimiento),
                    amount: montoAbsoluto,
                    date: movimiento.created_at, // Usar created_at en lugar de fecha
                    description: this.getDescriptionForMovement(movimiento),
                    category: this.getCategoryForMovement(movimiento.tipo_movimiento),
                    collector: 'Sistema', // Se puede mejorar obteniendo el nombre del usuario
                    raw_tipo: movimiento.tipo_movimiento,
                    usuario_id: movimiento.usuario_id,
                    referencia_id: movimiento.referencia_id,
                    nombre_trabajador: movimiento.nombre_trabajador, // Agregar el nombre del trabajador
                    gasto_descripcion: movimiento.gasto_descripcion || null, // Información del gasto
                    gasto_tipo: movimiento.gasto_tipo || null // Tipo del gasto
                };
                
                // Debug: Log la transacción si tiene nombre_trabajador o info de gasto
                if (movimiento.nombre_trabajador) {
                    console.log(`Transacción ${movimiento.id} con trabajador: ${movimiento.nombre_trabajador}`);
                }
                if (movimiento.gasto_descripcion) {
                    console.log(`Transacción ${movimiento.id} con gasto: ${movimiento.gasto_descripcion} (${movimiento.gasto_tipo})`);
                }
                
                transacciones.push(transaccion);
            });
            
            console.log(`TOTALES FINALES - Recolecciones: ${totalRecolecciones}, Gastos: ${totalGastos}, Saldo: ${totalSaldo}`);
            
            return {
                totals: {
                    balance: totalSaldo,
                    collections: totalRecolecciones,
                    expenses: totalGastos
                },
                transactions: transacciones.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            };
        } catch (error) {
            console.error('Error obteniendo resumen financiero del admin:', error);
            throw error;
        }
    }

    // Métodos auxiliares para mapear tipos
    static mapTipoToFinanceType(tipoMovimiento) {
        const mapping = {
            'entrega_cliente': 'disbursal',
            'abono_cliente': 'collection',
            'pago_multa': 'collection',
            'pago_acumulado': 'collection',
            'renovacion_prestamo': 'disbursal',
            'liquidacion_prestamo': 'collection',
            'entrega_trabajador': 'disbursal',
            'gasto_operativo': 'expense'
        };
        return mapping[tipoMovimiento] || 'expense';
    }

    static getCategoryForMovement(tipoMovimiento) {
        const mapping = {
            'entrega_cliente': 'Loan',
            'abono_cliente': 'Collection',
            'pago_multa': 'Penalty',
            'pago_acumulado': 'Penalty',
            'renovacion_prestamo': 'Loan',
            'liquidacion_prestamo': 'Loan',
            'entrega_trabajador': 'Operational',
            'gasto_operativo': 'Operational'
        };
        return mapping[tipoMovimiento] || 'Operational';
    }

    static getDescriptionForMovement(movimiento) {
        // Si es gasto operativo y tiene descripción específica, usarla
        if (movimiento.tipo_movimiento === 'gasto_operativo' && movimiento.gasto_descripcion) {
            return movimiento.gasto_descripcion;
        }
        
        const descriptions = {
            'entrega_cliente': 'Desembolso de Préstamo',
            'abono_cliente': 'Abono de Cliente',
            'pago_multa': 'Pago de Multa',
            'pago_acumulado': 'Pago de Multa Acumulada',
            'renovacion_prestamo': 'Renovación de Préstamo',
            'liquidacion_prestamo': 'Liquidación de Préstamo',
            'entrega_trabajador': 'Entrega a Trabajador',
            'gasto_operativo': 'Gasto Operativo'
        };
        return descriptions[movimiento.tipo_movimiento] || 'Movimiento Financiero';
    }

    // Método para obtener recolecciones por admin y fecha específica
    static async getCollectionsByAdminAndDate(adminId, fecha) {
        try {
            // Primero obtener todos los trabajadores del admin
            const { data: trabajadores, error: trabajadoresError } = await auth.supabaseAdmin
                .from('trabajadores')
                .select('id')
                .eq('usuario_id', adminId);
            
            if (trabajadoresError) throw trabajadoresError;
            
            const trabajadorIds = trabajadores.map(t => t.id);
            
            // Obtener movimientos de recolección del día específico
            // Los tipos de recolección son: abono_cliente, pago_multa, pago_acumulado, liquidacion_prestamo
            const tiposRecoleccion = ['abono_cliente', 'pago_multa', 'pago_acumulado', 'liquidacion_prestamo'];
            
            // NOTE: Esta función necesita ser llamada con fechas en formato UTC
            const { data: movimientos, error: movimientosError } = await auth.supabaseAdmin
                .from('movimientos')
                .select('id, tipo_movimiento, monto, usuario_id, created_at')
                .in('tipo_movimiento', tiposRecoleccion)
                .in('usuario_id', trabajadorIds)
                .gte('created_at', fecha)
                .order('created_at', { ascending: false });
            
            console.log(`🔍 Búsqueda de recolecciones por fecha: ${fecha} para ${trabajadorIds.length} trabajadores`);
            
            if (movimientosError) throw movimientosError;
            
            return movimientos;
        } catch (error) {
            console.error('Error obteniendo recolecciones por admin y fecha:', error);
            throw error;
        }
    }

    // Método para obtener recolecciones por admin y rango de fechas
    static async getCollectionsByAdminAndDateRange(adminId, fechaInicio, fechaFin) {
        try {
            // Primero obtener todos los trabajadores del admin
            const { data: trabajadores, error: trabajadoresError } = await auth.supabaseAdmin
                .from('trabajadores')
                .select('id')
                .eq('usuario_id', adminId);
            
            if (trabajadoresError) throw trabajadoresError;
            
            const trabajadorIds = trabajadores.map(t => t.id);
            
            // Obtener movimientos de recolección del rango de fechas
            // Los tipos de recolección son: abono_cliente, pago_multa, pago_acumulado, liquidacion_prestamo
            const tiposRecoleccion = ['abono_cliente', 'pago_multa', 'pago_acumulado', 'liquidacion_prestamo'];
            
            // NOTE: Esta función debe ser llamada con fechas en formato UTC
            const { data: movimientos, error: movimientosError } = await auth.supabaseAdmin
                .from('movimientos')
                .select('id, tipo_movimiento, monto, usuario_id, created_at')
                .in('tipo_movimiento', tiposRecoleccion)
                .in('usuario_id', trabajadorIds)
                .gte('created_at', fechaInicio)
                .lte('created_at', fechaFin)
                .order('created_at', { ascending: false });
            
            console.log(`🔍 Búsqueda de recolecciones por rango UTC: ${fechaInicio} - ${fechaFin} para ${trabajadorIds.length} trabajadores`);
            
            if (movimientosError) throw movimientosError;
            
            return movimientos;
        } catch (error) {
            console.error('Error obteniendo recolecciones por admin y rango de fechas:', error);
            throw error;
        }
    }

    // Método para obtener el balance de dinero de un trabajador
    static async getWorkerBalance(trabajadorId, adminId) {
        try {
            // Obtener todos los movimientos del trabajador
            const { data: movimientosTrabajador, error: errorTrabajador } = await auth.supabaseAdmin
                .from('movimientos')
                .select('tipo_movimiento, monto')
                .eq('usuario_id', trabajadorId);
            
            if (errorTrabajador) throw errorTrabajador;

            // Obtener movimientos donde el trabajador recibe dinero (entrega_trabajador)
            // Estos están con el admin como usuario_id y trabajador como referencia_id
            const { data: movimientosEntrega, error: errorEntrega } = await auth.supabaseAdmin
                .from('movimientos')
                .select('tipo_movimiento, monto')
                .eq('usuario_id', adminId)
                .eq('referencia_id', trabajadorId)
                .eq('tipo_movimiento', 'entrega_trabajador');
            
            if (errorEntrega) throw errorEntrega;

            let balance = 0;

            // Procesar movimientos del trabajador
            movimientosTrabajador.forEach(movimiento => {
                const monto = parseFloat(movimiento.monto);
                
                switch (movimiento.tipo_movimiento) {
                    // Dinero que recolecta (suma positiva)
                    case 'abono_cliente':
                    case 'pago_multa':
                    case 'pago_acumulado':
                    case 'liquidacion_prestamo':
                        balance += Math.abs(monto); // Asegurar que sea positivo
                        break;
                    
                    // Dinero que gasta/desembolsa (resta)
                    case 'gasto_operativo':
                    case 'entrega_cliente':
                    case 'renovacion_prestamo':
                        balance -= Math.abs(monto); // Restar el valor absoluto
                        break;
                }
            });

            // Procesar entregas de dinero del admin al trabajador (suma positiva)
            movimientosEntrega.forEach(movimiento => {
                const monto = parseFloat(movimiento.monto);
                balance += Math.abs(monto); // Los entrega_trabajador tienen signo negativo, pero queremos sumarlos
            });

            return {
                balance: balance,
                movimientos_procesados: movimientosTrabajador.length + movimientosEntrega.length
            };
        } catch (error) {
            console.error('Error calculando balance del trabajador:', error);
            throw error;
        }
    }

    // Método para obtener solo las recolecciones de un trabajador específico
    static async getWorkerCollections(trabajadorId, fechaInicio = null, fechaFin = null) {
        try {
            // Los tipos de recolección son: abono_cliente, pago_multa, pago_acumulado, liquidacion_prestamo
            const tiposRecoleccion = ['abono_cliente', 'pago_multa', 'pago_acumulado', 'liquidacion_prestamo'];
            
            let query = auth.supabaseAdmin
                .from('movimientos')
                .select('monto')
                .eq('usuario_id', trabajadorId)
                .in('tipo_movimiento', tiposRecoleccion);

            if (fechaInicio && fechaFin) {
                query = query.gte('fecha', fechaInicio).lte('fecha', fechaFin);
            }

            const { data, error } = await query;
            if (error) throw error;
            
            // Sumar todas las recolecciones (valores absolutos)
            const totalRecolecciones = data.reduce((total, movimiento) => {
                return total + Math.abs(parseFloat(movimiento.monto));
            }, 0);

            return {
                total_recolecciones: totalRecolecciones,
                cantidad_movimientos: data.length
            };
        } catch (error) {
            console.error('Error obteniendo recolecciones del trabajador:', error);
            throw error;
        }
    }

    // Método para obtener movimientos por usuario y rango de fechas con tipos específicos
    static async getMovimientosByUserAndDateRange(userId, fechaInicio, fechaFin, tiposMovimiento = []) {
        try {
            let query = auth.supabaseAdmin
                .from('movimientos')
                .select('*')
                .eq('usuario_id', userId)
                .gte('created_at', fechaInicio)
                .lte('created_at', fechaFin);

            if (tiposMovimiento.length > 0) {
                query = query.in('tipo_movimiento', tiposMovimiento);
            }

            const { data, error } = await query.order('created_at', { ascending: false });
            
            if (error) throw error;
            
            console.log(`🔍 Query movimientos para usuario ${userId}:`, {
                fechaInicio,
                fechaFin,
                tiposMovimiento,
                resultados: data?.length || 0
            });
            
            return data || [];
        } catch (error) {
            console.error('Error obteniendo movimientos por usuario y rango de fechas:', error);
            throw error;
        }
    }

    // Método para obtener movimientos por referencia_id y tipos específicos
    static async getMovimientosByReferenceAndType(referenciaId, tiposMovimiento = []) {
        try {
            let query = auth.supabaseAdmin
                .from('movimientos')
                .select('*')
                .eq('referencia_id', referenciaId);

            if (tiposMovimiento.length > 0) {
                query = query.in('tipo_movimiento', tiposMovimiento);
            }

            const { data, error } = await query.order('created_at', { ascending: false });
            
            if (error) throw error;
            
            return data || [];
        } catch (error) {
            console.error('Error obteniendo movimientos por referencia y tipo:', error);
            throw error;
        }
    }
}

module.exports = Movimiento; 