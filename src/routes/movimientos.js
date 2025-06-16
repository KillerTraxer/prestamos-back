const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Movimiento = require('../models/Movimiento');

// Crear nuevo movimiento
router.post('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const { tipo_movimiento, monto, fecha, usuario_id, referencia_id } = req.body;

    if (!tipo_movimiento || monto === undefined || !fecha || !usuario_id || !referencia_id) {
        return res.status(400).json({
            error: 'Campos requeridos faltantes',
            details: 'tipo_movimiento, monto, fecha, usuario_id y referencia_id son obligatorios'
        });
    }

    try {
        const movimiento = await Movimiento.create({
            tipo_movimiento,
            monto: parseFloat(monto),
            fecha,
            usuario_id: parseInt(usuario_id),
            referencia_id: parseInt(referencia_id)
        });

        res.status(201).json({
            message: 'Movimiento creado exitosamente',
            movimiento
        });
    } catch (error) {
        console.error('Error creando movimiento:', error);
        res.status(500).json({
            error: 'Error creando movimiento',
            message: error.message
        });
    }
});

// Obtener todos los movimientos
router.get('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const movimientos = await Movimiento.findAll();
        res.json(movimientos);
    } catch (error) {
        console.error('Error obteniendo movimientos:', error);
        res.status(500).json({
            error: 'Error obteniendo movimientos',
            message: error.message
        });
    }
});

// Obtener movimientos por usuario
router.get('/usuario/:id', authenticateJWT, async (req, res) => {
    // Los trabajadores solo pueden ver sus propios movimientos, los admins pueden ver todos
    if (req.user.role === 'trabajador' && req.user.id !== parseInt(req.params.id)) {
        return res.sendStatus(403);
    }
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') {
        return res.sendStatus(403);
    }

    try {
        let movimientos = await Movimiento.findByUserId(req.params.id);
        
        // Si es trabajador, filtrar solo sus movimientos por seguridad adicional
        if (req.user.role === 'trabajador') {
            movimientos = movimientos.filter(movimiento => movimiento.usuario_id === req.user.id);
        }
        
        res.json(movimientos);
    } catch (error) {
        console.error('Error obteniendo movimientos por usuario:', error);
        res.status(500).json({
            error: 'Error obteniendo movimientos por usuario',
            message: error.message
        });
    }
});

// Obtener movimientos por tipo
router.get('/tipo/:tipo', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const movimientos = await Movimiento.findByType(req.params.tipo);
        res.json(movimientos);
    } catch (error) {
        console.error('Error obteniendo movimientos por tipo:', error);
        res.status(500).json({
            error: 'Error obteniendo movimientos por tipo',
            message: error.message
        });
    }
});

// Obtener movimientos por referencia ID
router.get('/referencia/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const movimientos = await Movimiento.findByReferenceId(req.params.id);
        res.json(movimientos);
    } catch (error) {
        console.error('Error obteniendo movimientos por referencia:', error);
        res.status(500).json({
            error: 'Error obteniendo movimientos por referencia',
            message: error.message
        });
    }
});

// Obtener movimientos por rango de fechas
router.get('/fecha/:fechaInicio/:fechaFin', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const movimientos = await Movimiento.findByDateRange(req.params.fechaInicio, req.params.fechaFin);
        res.json(movimientos);
    } catch (error) {
        console.error('Error obteniendo movimientos por fecha:', error);
        res.status(500).json({
            error: 'Error obteniendo movimientos por fecha',
            message: error.message
        });
    }
});

// Obtener resumen diario
router.get('/resumen/:fecha', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const resumen = await Movimiento.getDailySummary(req.params.fecha);
        res.json(resumen);
    } catch (error) {
        console.error('Error obteniendo resumen diario:', error);
        res.status(500).json({
            error: 'Error obteniendo resumen diario',
            message: error.message
        });
    }
});

// Obtener total por tipo de movimiento
router.get('/total/tipo/:tipo', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { fechaInicio, fechaFin } = req.query;

    try {
        const total = await Movimiento.getTotalByType(req.params.tipo, fechaInicio, fechaFin);
        res.json({ 
            tipo_movimiento: req.params.tipo,
            total,
            periodo: fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : 'Todos los tiempos'
        });
    } catch (error) {
        console.error('Error obteniendo total por tipo:', error);
        res.status(500).json({
            error: 'Error obteniendo total por tipo',
            message: error.message
        });
    }
});

// Obtener total por usuario
router.get('/total/usuario/:id', authenticateJWT, async (req, res) => {
    // Los trabajadores solo pueden ver sus propios totales, los admins pueden ver todos
    if (req.user.role === 'trabajador' && req.user.id !== parseInt(req.params.id)) {
        return res.sendStatus(403);
    }
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') {
        return res.sendStatus(403);
    }

    const { fechaInicio, fechaFin } = req.query;

    try {
        // Para trabajadores, forzar el ID a su propio ID por seguridad
        const targetUserId = req.user.role === 'trabajador' ? req.user.id : parseInt(req.params.id);
        
        const total = await Movimiento.getTotalByUser(targetUserId, fechaInicio, fechaFin);
        res.json({ 
            usuario_id: targetUserId,
            total,
            periodo: fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : 'Todos los tiempos'
        });
    } catch (error) {
        console.error('Error obteniendo total por usuario:', error);
        res.status(500).json({
            error: 'Error obteniendo total por usuario',
            message: error.message
        });
    }
});

// Obtener movimientos de una fecha específica
router.get('/fecha/:fecha', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const movimientos = await Movimiento.getMovementsByDate(req.params.fecha);
        res.json(movimientos);
    } catch (error) {
        console.error('Error obteniendo movimientos de la fecha:', error);
        res.status(500).json({
            error: 'Error obteniendo movimientos de la fecha',
            message: error.message
        });
    }
});

// Obtener movimiento por ID
router.get('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const movimiento = await Movimiento.findById(req.params.id);
        
        if (!movimiento) {
            return res.status(404).json({
                error: 'Movimiento no encontrado'
            });
        }

        // Los trabajadores solo pueden ver sus propios movimientos
        if (req.user.role === 'trabajador' && movimiento.usuario_id !== req.user.id) {
            return res.sendStatus(403);
        }

        res.json(movimiento);
    } catch (error) {
        console.error('Error obteniendo movimiento:', error);
        res.status(500).json({
            error: 'Error obteniendo movimiento',
            message: error.message
        });
    }
});

// Actualizar movimiento (solo admins)
router.put('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const movimiento = await Movimiento.findById(req.params.id);
        
        if (!movimiento) {
            return res.status(404).json({
                error: 'Movimiento no encontrado'
            });
        }

        const updatedMovimiento = await movimiento.update(req.body);
        res.json({
            message: 'Movimiento actualizado exitosamente',
            movimiento: updatedMovimiento
        });
    } catch (error) {
        console.error('Error actualizando movimiento:', error);
        res.status(500).json({
            error: 'Error actualizando movimiento',
            message: error.message
        });
    }
});

// Eliminar movimiento (solo admins)
router.delete('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const movimiento = await Movimiento.findById(req.params.id);
        
        if (!movimiento) {
            return res.status(404).json({
                error: 'Movimiento no encontrado'
            });
        }

        await movimiento.delete();
        res.json({
            message: 'Movimiento eliminado exitosamente'
        });
    } catch (error) {
        console.error('Error eliminando movimiento:', error);
        res.status(500).json({
            error: 'Error eliminando movimiento',
            message: error.message
        });
    }
});

// Entregar dinero a trabajador (solo admins)
router.post('/entregar-trabajador', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { trabajador_id, monto, descripcion } = req.body;

    console.log('Entregando dinero a trabajador:', req.body);

    if (!trabajador_id || !monto) {
        return res.status(400).json({
            error: 'Campos requeridos faltantes',
            details: 'trabajador_id y monto son obligatorios'
        });
    }

    try {
        // Verificar que el trabajador existe
        const Trabajador = require('../models/Trabajador');
        const trabajador = await Trabajador.findById(trabajador_id);
        
        if (!trabajador) {
            return res.status(404).json({
                error: 'Trabajador no encontrado'
            });
        }

        // Crear el movimiento de entrega a trabajador
        const movimiento = await Movimiento.create({
            tipo_movimiento: 'entrega_trabajador',
            monto: parseFloat(monto),
            fecha: new Date().toISOString().split('T')[0],
            usuario_id: req.user.id, // El admin que hace la entrega
            referencia_id: trabajador_id, // ID del trabajador que recibe
        });

        res.status(201).json({
            message: 'Dinero entregado exitosamente',
            movimiento,
            trabajador: {
                id: trabajador.id,
                nombre: trabajador.nombre,
                email: trabajador.email
            }
        });
    } catch (error) {
        console.error('Error entregando dinero a trabajador:', error);
        res.status(500).json({
            error: 'Error entregando dinero a trabajador',
            message: error.message
        });
    }
});

// Obtener información de tipos de movimientos disponibles
router.get('/tipos', authenticateJWT, async (req, res) => {
    try {
        const tiposConfig = Movimiento.getTipoMovimientoConfig();
        const tiposInfo = Object.keys(tiposConfig).map(tipo => ({
            tipo_movimiento: tipo,
            signo: tiposConfig[tipo].signo,
            descripcion: tiposConfig[tipo].descripcion,
            es_ingreso: tiposConfig[tipo].signo === '+',
            es_egreso: tiposConfig[tipo].signo === '-'
        }));

        res.json({
            tipos_movimientos: tiposInfo,
            total_tipos: tiposInfo.length,
            tipos_ingreso: tiposInfo.filter(t => t.es_ingreso).length,
            tipos_egreso: tiposInfo.filter(t => t.es_egreso).length
        });
    } catch (error) {
        console.error('Error obteniendo tipos de movimientos:', error);
        res.status(500).json({
            error: 'Error obteniendo tipos de movimientos',
            message: error.message
        });
    }
});

// Obtener resumen financiero del admin
router.get('/finanzas/resumen', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { fechaInicio, fechaFin } = req.query;

    try {
        // Verificar cache primero
        const authCache = require('../utils/auth-cache');
        const periodKey = fechaInicio && fechaFin ? `${fechaInicio}_${fechaFin}` : 'all_time';
        const cachedSummary = authCache.getChartData(req.user.id, 'admin', 'financial_summary', periodKey);
        if (cachedSummary) {
            console.log('💰 Resumen financiero obtenido desde cache');
            return res.json(cachedSummary);
        }
        const resumen = await Movimiento.getFinancialSummaryByAdmin(
            req.user.id, 
            fechaInicio || null, 
            fechaFin || null
        );
        
        const result = {
            message: 'Resumen financiero obtenido exitosamente',
            data: resumen,
            periodo: fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : 'Todos los tiempos'
        };
        
        // Guardar en cache
        authCache.setChartData(req.user.id, 'admin', 'financial_summary', periodKey, result);
        console.log('💰 Resumen financiero guardado en cache');
        
        res.json(result);
    } catch (error) {
        console.error('Error obteniendo resumen financiero:', error);
        res.status(500).json({
            error: 'Error obteniendo resumen financiero',
            message: error.message
        });
    }
});

// Obtener balance total del sistema
router.get('/balance', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { fechaInicio, fechaFin } = req.query;

    try {
        const balance = await Movimiento.getBalanceTotal(fechaInicio, fechaFin);
        res.json({
            balance_total: balance,
            periodo: fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : 'Todos los tiempos',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error obteniendo balance total:', error);
        res.status(500).json({
            error: 'Error obteniendo balance total',
            message: error.message
        });
    }
});

// Obtener ingresos y egresos separados
router.get('/ingresos-egresos', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { fechaInicio, fechaFin } = req.query;

    try {
        const datos = await Movimiento.getIngresosEgresos(fechaInicio, fechaFin);
        res.json({
            ...datos,
            periodo: fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : 'Todos los tiempos',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error obteniendo ingresos y egresos:', error);
        res.status(500).json({
            error: 'Error obteniendo ingresos y egresos',
            message: error.message
        });
    }
});

// Obtener recolecciones de un trabajador específico
router.get('/recolecciones/usuario/:id', authenticateJWT, async (req, res) => {
    // Los trabajadores solo pueden ver sus propias recolecciones, los admins pueden ver todas
    if (req.user.role === 'trabajador' && req.user.id !== parseInt(req.params.id)) {
        return res.sendStatus(403);
    }
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') {
        return res.sendStatus(403);
    }

    const { fechaInicio, fechaFin } = req.query;

    try {
        // Para trabajadores, forzar el ID a su propio ID por seguridad
        const targetUserId = req.user.role === 'trabajador' ? req.user.id : parseInt(req.params.id);
        
        const recolecciones = await Movimiento.getWorkerCollections(targetUserId, fechaInicio, fechaFin);
        res.json({ 
            usuario_id: targetUserId,
            ...recolecciones,
            periodo: fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : 'Todos los tiempos'
        });
    } catch (error) {
        console.error('Error obteniendo recolecciones por usuario:', error);
        res.status(500).json({
            error: 'Error obteniendo recolecciones por usuario',
            message: error.message
        });
    }
});

module.exports = router; 