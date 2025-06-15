const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const { auth } = require('../config/supabase');
const Movimiento = require('../models/Movimiento');
const Trabajador = require('../models/Trabajador');
const Client = require('../models/Client');
const moment = require('moment-timezone');

// Configurar timezone para México
moment.tz.setDefault('America/Mexico_City');

// Obtener estadísticas para admin con filtros de tiempo
router.get('/admin', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { periodo = 'Diario' } = req.query;
    const adminId = req.user.id;

    try {
        // Definir rangos de fechas según el período en zona horaria de México
        let fechaInicioLocal, fechaFinLocal, fechaInicioUTC, fechaFinUTC;
        const ahora = moment().tz('America/Mexico_City');

        switch (periodo) {
            case 'Diario':
                fechaInicioLocal = ahora.clone().startOf('day');
                fechaFinLocal = ahora.clone().endOf('day');
                break;
            case 'Semanal':
                fechaInicioLocal = ahora.clone().startOf('week');
                fechaFinLocal = ahora.clone().endOf('week');
                break;
            case 'Mensual':
                fechaInicioLocal = ahora.clone().startOf('month');
                fechaFinLocal = ahora.clone().endOf('month');
                break;
            default:
                fechaInicioLocal = ahora.clone().startOf('day');
                fechaFinLocal = ahora.clone().endOf('day');
        }

        // Convertir a UTC para consultas en base de datos
        fechaInicioUTC = fechaInicioLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');
        fechaFinUTC = fechaFinLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');
        
        // Mantener formato local para respuesta
        const fechaInicio = fechaInicioLocal.format('YYYY-MM-DD');
        const fechaFin = fechaFinLocal.format('YYYY-MM-DD');

        console.log('📅 Conversión de fechas para admin stats:', {
            periodo,
            fechaInicioLocal: fechaInicioLocal.format('YYYY-MM-DD HH:mm:ss'),
            fechaFinLocal: fechaFinLocal.format('YYYY-MM-DD HH:mm:ss'),
            fechaInicioUTC,
            fechaFinUTC
        });

        // Obtener resumen financiero del admin (usando fechas UTC para queries)
        const resumenFinanciero = await Movimiento.getFinancialSummaryByAdmin(adminId, fechaInicioUTC, fechaFinUTC);
        
        console.log('Resumen financiero obtenido:', resumenFinanciero);
        
        // Obtener trabajadores del admin
        const trabajadores = await Trabajador.findAll({ usuario_id: adminId });
        
        // Obtener total de clientes del admin
        let totalClientes = 0;
        for (const trabajador of trabajadores) {
            const clientes = await Client.findByWorkerId(trabajador.id);
            totalClientes += clientes.length;
        }

        // Obtener datos para gráfica de recolecciones por días (usando fechas UTC)
        const recoleccionesPorDia = await obtenerRecoleccionesPorDia(adminId, fechaInicioUTC, fechaFinUTC, periodo);

        // Estadísticas generales - usar la estructura correcta del resumen financiero
        const estadisticas = {
            total_recolecciones: resumenFinanciero.totals?.collections || 0,
            total_gastos: resumenFinanciero.totals?.expenses || 0,
            saldo_total: resumenFinanciero.totals?.balance || 0,
            total_trabajadores: trabajadores.length,
            total_clientes: totalClientes,
            recolecciones_por_dia: recoleccionesPorDia,
            periodo_actual: periodo,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin
        };

        res.json(estadisticas);
    } catch (error) {
        console.error('Error obteniendo estadísticas del admin:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas del admin' });
    }
});

// Obtener estadísticas para trabajador con filtros de tiempo
router.get('/trabajador', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador') return res.sendStatus(403);

    const { periodo = 'Diario' } = req.query;
    const trabajadorId = req.user.id;

    try {
        // Definir rangos de fechas según el período en zona horaria de México
        let fechaInicioLocal, fechaFinLocal, fechaInicioUTC, fechaFinUTC;
        const ahora = moment().tz('America/Mexico_City');

        switch (periodo) {
            case 'Diario':
                fechaInicioLocal = ahora.clone().startOf('day');
                fechaFinLocal = ahora.clone().endOf('day');
                break;
            case 'Semanal':
                fechaInicioLocal = ahora.clone().startOf('week');
                fechaFinLocal = ahora.clone().endOf('week');
                break;
            case 'Mensual':
                fechaInicioLocal = ahora.clone().startOf('month');
                fechaFinLocal = ahora.clone().endOf('month');
                break;
            default:
                fechaInicioLocal = ahora.clone().startOf('day');
                fechaFinLocal = ahora.clone().endOf('day');
        }

        // Convertir a UTC para consultas en base de datos
        fechaInicioUTC = fechaInicioLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');
        fechaFinUTC = fechaFinLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');
        
        // Mantener formato local para respuesta
        const fechaInicio = fechaInicioLocal.format('YYYY-MM-DD');
        const fechaFin = fechaFinLocal.format('YYYY-MM-DD');

        console.log('📅 Conversión de fechas para worker stats:', {
            periodo,
            fechaInicioLocal: fechaInicioLocal.format('YYYY-MM-DD HH:mm:ss'),
            fechaFinLocal: fechaFinLocal.format('YYYY-MM-DD HH:mm:ss'),
            fechaInicioUTC,
            fechaFinUTC
        });

        // Obtener movimientos de recolección del trabajador (usando fechas UTC)
        const tiposRecoleccion = ['abono_cliente', 'pago_multa', 'pago_acumulado', 'liquidacion_prestamo'];
        const movimientosRecoleccion = await Movimiento.getMovimientosByUserAndDateRange(
            trabajadorId, fechaInicioUTC, fechaFinUTC, tiposRecoleccion
        );

        // Obtener movimientos de gastos del trabajador (usando fechas UTC)
        const tiposGastos = ['gasto_operativo', 'entrega_cliente', 'renovacion_prestamo'];
        const movimientosGastos = await Movimiento.getMovimientosByUserAndDateRange(
            trabajadorId, fechaInicioUTC, fechaFinUTC, tiposGastos
        );

        // Calcular totales
        const totalRecolectado = movimientosRecoleccion.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
        const totalGastos = movimientosGastos.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);

        // Obtener clientes del trabajador
        const clientes = await Client.findByWorkerId(trabajadorId);

        // Obtener multas y adeudos de los clientes del trabajador
        const clienteIds = clientes.map(c => c.id);
        let totalMultas = 0;
        let totalAdeudos = 0;

        if (clienteIds.length > 0) {
            // Obtener multas pendientes
            const { data: multas, error: multasError } = await auth.supabaseAdmin
                .from('multas')
                .select('monto')
                .in('cliente_id', clienteIds)
                .eq('estado', 'pendiente');

            if (!multasError && multas) {
                totalMultas = multas.reduce((sum, multa) => sum + parseFloat(multa.monto), 0);
            }

            // Obtener adeudos pendientes
            const { data: adeudos, error: adeudosError } = await auth.supabaseAdmin
                .from('adeudos')
                .select('monto')
                .in('cliente_id', clienteIds)
                .eq('estado', 'pendiente');

            if (!adeudosError && adeudos) {
                totalAdeudos = adeudos.reduce((sum, adeudo) => sum + parseFloat(adeudo.monto), 0);
            }
        }

        // Obtener datos para gráfica de recolecciones por días del trabajador (usando fechas UTC)
        const recoleccionesPorDia = await obtenerRecoleccionesPorDiaTrabajador(trabajadorId, fechaInicioUTC, fechaFinUTC, periodo);

        // Estadísticas del trabajador
        const estadisticas = {
            total_recolecciones: totalRecolectado,
            total_gastos: totalGastos,
            saldo_total: totalRecolectado - totalGastos,
            total_clientes: clientes.length,
            total_multas: totalMultas,
            total_adeudos: totalAdeudos,
            recolecciones_por_dia: recoleccionesPorDia,
            periodo_actual: periodo,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin
        };

        res.json(estadisticas);
    } catch (error) {
        console.error('Error obteniendo estadísticas del trabajador:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas del trabajador' });
    }
});

// Obtener rendimiento de trabajadores para el admin
router.get('/trabajadores-rendimiento', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { periodo = 'Diario' } = req.query;
    const adminId = req.user.id;

    try {
        // Definir rangos de fechas según el período en zona horaria de México
        let fechaInicioLocal, fechaFinLocal, fechaInicioUTC, fechaFinUTC;
        const ahora = moment().tz('America/Mexico_City');

        switch (periodo) {
            case 'Diario':
                fechaInicioLocal = ahora.clone().startOf('day');
                fechaFinLocal = ahora.clone().endOf('day');
                break;
            case 'Semanal':
                fechaInicioLocal = ahora.clone().startOf('week');
                fechaFinLocal = ahora.clone().endOf('week');
                break;
            case 'Mensual':
                fechaInicioLocal = ahora.clone().startOf('month');
                fechaFinLocal = ahora.clone().endOf('month');
                break;
            default:
                fechaInicioLocal = ahora.clone().startOf('day');
                fechaFinLocal = ahora.clone().endOf('day');
        }

        // Convertir a UTC para consultas en base de datos
        fechaInicioUTC = fechaInicioLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');
        fechaFinUTC = fechaFinLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');

        console.log('📅 Conversión de fechas para workers performance:', {
            periodo,
            fechaInicioLocal: fechaInicioLocal.format('YYYY-MM-DD HH:mm:ss'),
            fechaFinLocal: fechaFinLocal.format('YYYY-MM-DD HH:mm:ss'),
            fechaInicioUTC,
            fechaFinUTC
        });

        // Obtener trabajadores del admin
        const trabajadores = await Trabajador.findAll({ usuario_id: adminId });
        
        // Calcular rendimiento de cada trabajador
        const rendimientoTrabajadores = await Promise.all(
            trabajadores.map(async (trabajador) => {
                // Obtener clientes del trabajador
                const clientes = await Client.findByWorkerId(trabajador.id);
                
                // Obtener movimientos de recolección del trabajador (usando fechas UTC)
                const tiposRecoleccion = ['abono_cliente', 'pago_multa', 'pago_acumulado', 'liquidacion_prestamo'];
                const movimientosRecoleccion = await Movimiento.getMovimientosByUserAndDateRange(
                    trabajador.id, fechaInicioUTC, fechaFinUTC, tiposRecoleccion
                );
                
                // Obtener movimientos de gastos del trabajador (usando fechas UTC)
                const tiposGastos = ['gasto_operativo', 'entrega_cliente', 'renovacion_prestamo'];
                const movimientosGastos = await Movimiento.getMovimientosByUserAndDateRange(
                    trabajador.id, fechaInicioUTC, fechaFinUTC, tiposGastos
                );

                // Calcular totales
                const totalRecolectado = movimientosRecoleccion.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
                const totalGastos = movimientosGastos.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);

                return {
                    id: trabajador.id,
                    nombre: trabajador.nombre,
                    clientes: clientes.length,
                    recolectado: totalRecolectado,
                    gastos: totalGastos,
                    balance: totalRecolectado - totalGastos
                };
            })
        );

        res.json(rendimientoTrabajadores);
    } catch (error) {
        console.error('Error obteniendo rendimiento de trabajadores:', error);
        res.status(500).json({ error: 'Error obteniendo rendimiento de trabajadores' });
    }
});

// Obtener lista de clientes del admin con detalles
router.get('/clientes-detalle', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const adminId = req.user.id;

    try {
        // Obtener trabajadores del admin
        const trabajadores = await Trabajador.findAll({ usuario_id: adminId });
        const trabajadorIds = trabajadores.map(t => t.id);
        
        if (trabajadorIds.length === 0) {
            return res.json([]);
        }

        // Obtener todos los clientes con sus préstamos más recientes
        const { data: clientesConPrestamos, error: prestamosError } = await auth.supabaseAdmin
            .from('prestamos')
            .select(`
                cliente_id,
                monto,
                interes,
                fecha_inicio,
                fecha_fin,
                estado,
                created_at,
                clientes!inner (
                    id,
                    nombre,
                    telefono,
                    direccion,
                    ocupacion,
                    trabajador_id
                )
            `)
            .in('clientes.trabajador_id', trabajadorIds)
            .order('created_at', { ascending: false });

        if (prestamosError) {
            console.error('Error obteniendo préstamos:', prestamosError);
            throw prestamosError;
        }

        // Agrupar por cliente_id para obtener el préstamo más reciente de cada cliente
        const clientesMap = new Map();
        clientesConPrestamos.forEach(prestamo => {
            const clienteId = prestamo.cliente_id;
            if (!clientesMap.has(clienteId)) {
                clientesMap.set(clienteId, {
                    ...prestamo.clientes,
                    monto_prestamo: prestamo.monto,
                    interes: prestamo.interes,
                    fecha_inicio: prestamo.fecha_inicio,
                    fecha_fin: prestamo.fecha_fin,
                    estado_prestamo: prestamo.estado,
                    prestamo_created_at: prestamo.created_at
                });
            }
        });

        const clientesUnicos = Array.from(clientesMap.values());

        // Procesar cada cliente para obtener información detallada
        const clientesDetalle = await Promise.all(
            clientesUnicos.map(async (cliente) => {
                // Obtener multas pendientes del cliente
                const { data: multas, error: multasError } = await auth.supabaseAdmin
                    .from('multas')
                    .select('monto')
                    .eq('cliente_id', cliente.id)
                    .eq('estado', 'pendiente');

                if (multasError) {
                    console.error('Error obteniendo multas:', multasError);
                }

                const totalMultas = multas ? multas.reduce((sum, multa) => sum + parseFloat(multa.monto), 0) : 0;

                // Obtener adeudos pendientes del cliente
                const { data: adeudos, error: adeudosError } = await auth.supabaseAdmin
                    .from('adeudos')
                    .select('monto')
                    .eq('cliente_id', cliente.id)
                    .eq('estado', 'pendiente');

                if (adeudosError) {
                    console.error('Error obteniendo adeudos:', adeudosError);
                }

                const totalAdeudos = adeudos ? adeudos.reduce((sum, adeudo) => sum + parseFloat(adeudo.monto), 0) : 0;

                // Calcular estado del préstamo basado en la prioridad especificada
                const estado = calcularEstadoPrestamoFromData(cliente.estado_prestamo, cliente.fecha_fin);

                return {
                    id: cliente.id,
                    nombre: cliente.nombre,
                    telefono: cliente.telefono || 'No disponible',
                    direccion: cliente.direccion || 'No disponible',
                    ocupacion: cliente.ocupacion || 'No especificada',
                    monto_prestamo: cliente.monto_prestamo || 0,
                    fecha_inicio: cliente.fecha_inicio,
                    fecha_fin: cliente.fecha_fin,
                    estado: estado,
                    multas: totalMultas,
                    adeudos: totalAdeudos
                };
            })
        );

        res.json(clientesDetalle);
    } catch (error) {
        console.error('Error obteniendo detalle de clientes:', error);
        res.status(500).json({ error: 'Error obteniendo detalle de clientes' });
    }
});

// Obtener lista de clientes del trabajador con detalles
router.get('/trabajador-clientes-detalle', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador') return res.sendStatus(403);

    const trabajadorId = req.user.id;

    try {
        // Obtener clientes del trabajador con sus préstamos más recientes
        const { data: clientesConPrestamos, error: prestamosError } = await auth.supabaseAdmin
            .from('prestamos')
            .select(`
                cliente_id,
                monto,
                interes,
                fecha_inicio,
                fecha_fin,
                estado,
                created_at,
                clientes!inner (
                    id,
                    nombre,
                    telefono,
                    direccion,
                    ocupacion,
                    trabajador_id
                )
            `)
            .eq('clientes.trabajador_id', trabajadorId)
            .order('created_at', { ascending: false });

        if (prestamosError) {
            console.error('Error obteniendo préstamos del trabajador:', prestamosError);
            throw prestamosError;
        }

        // Agrupar por cliente_id para obtener el préstamo más reciente de cada cliente
        const clientesMap = new Map();
        clientesConPrestamos.forEach(prestamo => {
            const clienteId = prestamo.cliente_id;
            if (!clientesMap.has(clienteId)) {
                clientesMap.set(clienteId, {
                    ...prestamo.clientes,
                    monto_prestamo: prestamo.monto,
                    interes: prestamo.interes,
                    fecha_inicio: prestamo.fecha_inicio,
                    fecha_fin: prestamo.fecha_fin,
                    estado_prestamo: prestamo.estado,
                    prestamo_created_at: prestamo.created_at
                });
            }
        });

        const clientesUnicos = Array.from(clientesMap.values());

        // Procesar cada cliente para obtener información detallada
        const clientesDetalle = await Promise.all(
            clientesUnicos.map(async (cliente) => {
                // Obtener multas pendientes del cliente
                const { data: multas, error: multasError } = await auth.supabaseAdmin
                    .from('multas')
                    .select('monto')
                    .eq('cliente_id', cliente.id)
                    .eq('estado', 'pendiente');

                if (multasError) {
                    console.error('Error obteniendo multas:', multasError);
                }

                const totalMultas = multas ? multas.reduce((sum, multa) => sum + parseFloat(multa.monto), 0) : 0;

                // Obtener adeudos pendientes del cliente
                const { data: adeudos, error: adeudosError } = await auth.supabaseAdmin
                    .from('adeudos')
                    .select('monto')
                    .eq('cliente_id', cliente.id)
                    .eq('estado', 'pendiente');

                if (adeudosError) {
                    console.error('Error obteniendo adeudos:', adeudosError);
                }

                const totalAdeudos = adeudos ? adeudos.reduce((sum, adeudo) => sum + parseFloat(adeudo.monto), 0) : 0;

                // Calcular estado del préstamo basado en la prioridad especificada
                const estado = calcularEstadoPrestamoFromData(cliente.estado_prestamo, cliente.fecha_fin);

                return {
                    id: cliente.id,
                    nombre: cliente.nombre,
                    telefono: cliente.telefono || 'No disponible',
                    direccion: cliente.direccion || 'No disponible',
                    ocupacion: cliente.ocupacion || 'No especificada',
                    monto_prestamo: cliente.monto_prestamo || 0,
                    fecha_inicio: cliente.fecha_inicio,
                    fecha_fin: cliente.fecha_fin,
                    estado: estado,
                    multas: totalMultas,
                    adeudos: totalAdeudos
                };
            })
        );

        res.json(clientesDetalle);
    } catch (error) {
        console.error('Error obteniendo detalle de clientes del trabajador:', error);
        res.status(500).json({ error: 'Error obteniendo detalle de clientes del trabajador' });
    }
});

// Función auxiliar para obtener recolecciones por día
async function obtenerRecoleccionesPorDia(adminId, fechaInicio, fechaFin, periodo) {
    try {
        const movimientos = await Movimiento.getFinancialMovementsByAdmin(adminId, fechaInicio, fechaFin);
        
        console.log(`Generando gráfica para período: ${periodo}, rango: ${fechaInicio} - ${fechaFin}`);
        console.log(`Total movimientos obtenidos: ${movimientos.length}`);
        
        // Filtrar solo movimientos de recolección
        const tiposRecoleccion = ['abono_cliente', 'pago_multa', 'pago_acumulado', 'liquidacion_prestamo'];
        const recolecciones = movimientos.filter(mov => tiposRecoleccion.includes(mov.tipo_movimiento));
        
        console.log(`Movimientos de recolección filtrados: ${recolecciones.length}`);

        // Generar estructura de datos según el período
        let datosGrafica = [];
        
        switch (periodo) {
            case 'Diario':
                // Para diario, mostrar el día actual dividido en 8 períodos de 3 horas cada uno
                const inicioDelDia = moment().tz('America/Mexico_City').startOf('day');
                const finDelDia = moment().tz('America/Mexico_City').endOf('day');
                
                // Crear 8 períodos de 3 horas cada uno (00:00-03:00, 03:00-06:00, etc.)
                for (let i = 0; i < 8; i++) {
                    const inicioRango = inicioDelDia.clone().add(i * 3, 'hours');
                    const finRango = inicioRango.clone().add(3, 'hours');
                    const label = inicioRango.format('HH:mm');
                    
                    // Buscar recolecciones en este rango de 3 horas
                    const recoleccionesRango = recolecciones.filter(mov => {
                        // Convertir la fecha UTC del movimiento a timezone de México
                        const fechaMovMexico = moment.utc(mov.created_at).tz('America/Mexico_City');
                        return fechaMovMexico.isBetween(inicioRango, finRango, null, '[)');
                    });
                    
                    const total = recoleccionesRango.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
                    
                    console.log(`Rango ${label}: ${recoleccionesRango.length} movimientos, total: ${total}`);
                    
                    datosGrafica.push({
                        label,
                        value: Math.round(total),
                        frontColor: '#0061FF',
                        gradientColor: '#4285F4'
                    });
                }
                break;
                
            case 'Semanal':
                // Para semanal, mostrar los últimos 7 días
                const hoy = moment().tz('America/Mexico_City');
                for (let i = 6; i >= 0; i--) {
                    const dia = hoy.clone().subtract(i, 'days');
                    const label = dia.format('ddd'); // Lun, Mar, etc.
                    const inicioDia = dia.clone().startOf('day');
                    const finDia = dia.clone().endOf('day');
                    
                    // Buscar recolecciones de ese día usando created_at en UTC
                    const recoleccionesDia = recolecciones.filter(mov => {
                        // Convertir la fecha UTC del movimiento a timezone de México
                        const fechaMovMexico = moment.utc(mov.created_at).tz('America/Mexico_City');
                        return fechaMovMexico.isBetween(inicioDia, finDia, null, '[]');
                    });
                    
                    const total = recoleccionesDia.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
                    
                    console.log(`Día ${label}: ${recoleccionesDia.length} movimientos, total: ${total}`);
                    
                    datosGrafica.push({
                        label,
                        value: Math.round(total),
                        frontColor: '#0061FF',
                        gradientColor: '#4285F4'
                    });
                }
                break;
                
            case 'Mensual':
                // Para mensual, mostrar las últimas 4 semanas
                const semanaActual = moment().tz('America/Mexico_City');
                for (let i = 3; i >= 0; i--) {
                    const semana = semanaActual.clone().subtract(i, 'weeks');
                    const inicioSemana = semana.clone().startOf('week');
                    const finSemana = semana.clone().endOf('week');
                    // Cambiar el label para mostrar la fecha de inicio de la semana
                    const label = inicioSemana.format('DD MMM'); // Ej: "15 May", "22 May"
                    
                    // Buscar recolecciones de esa semana usando created_at en UTC
                    const recoleccionesSemana = recolecciones.filter(mov => {
                        // Convertir la fecha UTC del movimiento a timezone de México
                        const fechaMovMexico = moment.utc(mov.created_at).tz('America/Mexico_City');
                        return fechaMovMexico.isBetween(inicioSemana, finSemana, null, '[]');
                    });
                    
                    const total = recoleccionesSemana.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
                    
                    console.log(`Semana ${label}: ${recoleccionesSemana.length} movimientos, total: ${total}`);
                    
                    datosGrafica.push({
                        label,
                        value: Math.round(total),
                        frontColor: '#0061FF',
                        gradientColor: '#4285F4'
                    });
                }
                break;
                
            default:
                // Fallback: mostrar solo el total del día actual
                const totalDia = recolecciones.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
                datosGrafica = [{
                    label: 'Hoy',
                    value: Math.round(totalDia),
                    frontColor: '#0061FF',
                    gradientColor: '#4285F4'
                }];
        }
        
        console.log('Datos de gráfica generados:', datosGrafica);
        return datosGrafica;
        
    } catch (error) {
        console.error('Error obteniendo recolecciones por día:', error);
        return [];
    }
}

// Función auxiliar para calcular estado del préstamo desde datos de la tabla prestamos
function calcularEstadoPrestamoFromData(estadoPrestamo, fechaFin) {
    const ahora = moment().tz('America/Mexico_City');
    const fechaTermino = moment(fechaFin);
    
    // Prioridad: préstamo atrasado > préstamo activo > último préstamo liquidado > último préstamo completado
    if (estadoPrestamo === 'atrasado' || (fechaTermino.isBefore(ahora) && estadoPrestamo === 'activo')) {
        return 'Atrasado';
    } else if (estadoPrestamo === 'activo') {
        return 'Activo';
    } else if (estadoPrestamo === 'liquidado') {
        return 'Liquidado';
    } else if (estadoPrestamo === 'completado') {
        return 'Completado';
    }
    
    return 'Desconocido';
}

// Función auxiliar para calcular estado del préstamo (versión anterior para compatibilidad)
function calcularEstadoPrestamo(cliente) {
    const ahora = moment().tz('America/Mexico_City');
    const fechaTermino = moment(cliente.fecha_termino);
    
    // Prioridad: préstamo atrasado > préstamo activo > último préstamo liquidado > último préstamo completado
    if (cliente.estado === 'atrasado' || (fechaTermino.isBefore(ahora) && cliente.estado === 'activo')) {
        return 'Atrasado';
    } else if (cliente.estado === 'activo') {
        return 'Activo';
    } else if (cliente.estado === 'liquidado') {
        return 'Liquidado';
    } else if (cliente.estado === 'completado') {
        return 'Completado';
    }
    
    return 'Desconocido';
}

// Función auxiliar para obtener recolecciones por día del trabajador
async function obtenerRecoleccionesPorDiaTrabajador(trabajadorId, fechaInicio, fechaFin, periodo) {
    try {
        // Obtener movimientos del trabajador directamente
        const movimientos = await Movimiento.getMovimientosByUserAndDateRange(trabajadorId, fechaInicio, fechaFin);
        
        console.log(`Generando gráfica para trabajador ${trabajadorId}, período: ${periodo}, rango: ${fechaInicio} - ${fechaFin}`);
        console.log(`Total movimientos obtenidos: ${movimientos.length}`);
        
        // Filtrar solo movimientos de recolección
        const tiposRecoleccion = ['abono_cliente', 'pago_multa', 'pago_acumulado', 'liquidacion_prestamo'];
        const recolecciones = movimientos.filter(mov => tiposRecoleccion.includes(mov.tipo_movimiento));
        
        console.log(`Movimientos de recolección filtrados: ${recolecciones.length}`);

        // Generar estructura de datos según el período
        let datosGrafica = [];
        
        switch (periodo) {
            case 'Diario':
                // Para diario, mostrar el día actual dividido en 8 períodos de 3 horas cada uno
                const inicioDelDia = moment().tz('America/Mexico_City').startOf('day');
                const finDelDia = moment().tz('America/Mexico_City').endOf('day');
                
                // Crear 8 períodos de 3 horas cada uno (00:00-03:00, 03:00-06:00, etc.)
                for (let i = 0; i < 8; i++) {
                    const inicioRango = inicioDelDia.clone().add(i * 3, 'hours');
                    const finRango = inicioRango.clone().add(3, 'hours');
                    const label = inicioRango.format('HH:mm');
                    
                    // Buscar recolecciones en este rango de 3 horas
                    const recoleccionesRango = recolecciones.filter(mov => {
                        // Convertir la fecha UTC del movimiento a timezone de México
                        const fechaMovMexico = moment.utc(mov.created_at).tz('America/Mexico_City');
                        return fechaMovMexico.isBetween(inicioRango, finRango, null, '[)');
                    });
                    
                    const total = recoleccionesRango.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
                    
                    console.log(`Rango ${label}: ${recoleccionesRango.length} movimientos, total: ${total}`);
                    
                    datosGrafica.push({
                        label,
                        value: Math.round(total),
                        frontColor: '#0061FF',
                        gradientColor: '#4285F4'
                    });
                }
                break;
                
            case 'Semanal':
                // Para semanal, mostrar los últimos 7 días
                const hoy = moment().tz('America/Mexico_City');
                for (let i = 6; i >= 0; i--) {
                    const dia = hoy.clone().subtract(i, 'days');
                    const label = dia.format('ddd'); // Lun, Mar, etc.
                    const inicioDia = dia.clone().startOf('day');
                    const finDia = dia.clone().endOf('day');
                    
                    // Buscar recolecciones de ese día usando created_at en UTC
                    const recoleccionesDia = recolecciones.filter(mov => {
                        // Convertir la fecha UTC del movimiento a timezone de México
                        const fechaMovMexico = moment.utc(mov.created_at).tz('America/Mexico_City');
                        return fechaMovMexico.isBetween(inicioDia, finDia, null, '[]');
                    });
                    
                    const total = recoleccionesDia.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
                    
                    console.log(`Día ${label}: ${recoleccionesDia.length} movimientos, total: ${total}`);
                    
                    datosGrafica.push({
                        label,
                        value: Math.round(total),
                        frontColor: '#0061FF',
                        gradientColor: '#4285F4'
                    });
                }
                break;
                
            case 'Mensual':
                // Para mensual, mostrar las últimas 4 semanas
                const semanaActual = moment().tz('America/Mexico_City');
                for (let i = 3; i >= 0; i--) {
                    const semana = semanaActual.clone().subtract(i, 'weeks');
                    const inicioSemana = semana.clone().startOf('week');
                    const finSemana = semana.clone().endOf('week');
                    // Cambiar el label para mostrar la fecha de inicio de la semana
                    const label = inicioSemana.format('DD MMM'); // Ej: "15 May", "22 May"
                    
                    // Buscar recolecciones de esa semana usando created_at en UTC
                    const recoleccionesSemana = recolecciones.filter(mov => {
                        // Convertir la fecha UTC del movimiento a timezone de México
                        const fechaMovMexico = moment.utc(mov.created_at).tz('America/Mexico_City');
                        return fechaMovMexico.isBetween(inicioSemana, finSemana, null, '[]');
                    });
                    
                    const total = recoleccionesSemana.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
                    
                    console.log(`Semana ${label}: ${recoleccionesSemana.length} movimientos, total: ${total}`);
                    
                    datosGrafica.push({
                        label,
                        value: Math.round(total),
                        frontColor: '#0061FF',
                        gradientColor: '#4285F4'
                    });
                }
                break;
                
            default:
                // Fallback: mostrar solo el total del día actual
                const totalDia = recolecciones.reduce((sum, mov) => sum + Math.abs(parseFloat(mov.monto)), 0);
                datosGrafica = [{
                    label: 'Hoy',
                    value: Math.round(totalDia),
                    frontColor: '#0061FF',
                    gradientColor: '#4285F4'
                }];
        }
        
        console.log('Datos de gráfica generados para trabajador:', datosGrafica);
        return datosGrafica;
        
    } catch (error) {
        console.error('Error obteniendo recolecciones por día del trabajador:', error);
        return [];
    }
}

module.exports = router;