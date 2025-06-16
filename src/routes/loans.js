const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');
const Fine = require('../models/Fine');
const Client = require('../models/Client');
const Adeudo = require('../models/Adeudo');

// Obtener todos los préstamos
router.get('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        // Verificar cache primero
        const authCache = require('../utils/auth-cache');
        const cacheKey = req.query.collectorId ? `loans_by_collector:${req.query.collectorId}` : `loans:${req.user.id}`;
        const cachedLoans = authCache.getChartData(req.user.id, req.user.role, 'loans_list', cacheKey);
        if (cachedLoans) {
            console.log('💳 Lista de préstamos obtenida desde cache');
            return res.json(cachedLoans);
        }
        let prestamos;
        // Si es admin y hay un collectorId, obtener préstamos de ese trabajador
        if (req.user.role === 'admin' && req.query.collectorId) {
            prestamos = await Loan.findByWorkerId(req.query.collectorId);
        } else {
            // Si no es admin o no hay collectorId, obtener préstamos del trabajador actual
            prestamos = await Loan.findByWorkerId(req.user.id);
        }
        // Guardar en cache
        authCache.setChartData(req.user.id, req.user.role, 'loans_list', cacheKey, prestamos);
        console.log('💳 Lista de préstamos guardada en cache');
        
        res.json(prestamos);
    } catch (error) {
        console.error('Error obteniendo préstamos:', error);
        res.status(500).json({ error: 'Error obteniendo préstamos' });
    }
});

// Crear nuevo préstamo
router.post('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const {
        cliente_id,
        trabajador_id,
        monto,
        interes,
        fecha_inicio,
        fecha_fin,
        observaciones,
        pago_diario
    } = req.body;

    if (!cliente_id || !trabajador_id || !monto || !interes || !fecha_inicio || !fecha_fin) {
        return res.status(400).json({
            error: 'Faltan campos requeridos',
            details: 'cliente_id, trabajador_id, monto, interes, fecha_inicio y fecha_fin son obligatorios'
        });
    }

    try {
        // Verificar que el cliente existe
        const cliente = await Client.findById(cliente_id);
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const prestamoData = {
            cliente_id,
            trabajador_id,
            monto,
            interes,
            fecha_inicio,
            fecha_fin,
            estado: 'activo',
            observaciones: observaciones || '',
            pago_diario: pago_diario || 0
        };

        const newPrestamo = await Loan.create(prestamoData);

        res.status(201).json({
            message: 'Préstamo creado exitosamente',
            id: newPrestamo.id,
            prestamo: newPrestamo
        });
    } catch (error) {
        console.error('Error creando préstamo:', error);
        res.status(500).json({
            error: 'Error creando préstamo',
            message: error.message,
            details: error.details || 'No hay detalles adicionales disponibles'
        });
    }
});

// Obtener préstamo por ID
router.get('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const prestamoId = req.params.id;

    try {
        const prestamo = await Loan.findById(prestamoId);
        if (!prestamo) {
            return res.status(404).json({ error: 'Préstamo no encontrado' });
        }

        res.json(prestamo);
    } catch (error) {
        console.error('Error obteniendo préstamo:', error);
        res.status(500).json({ error: 'Error obteniendo préstamo' });
    }
});

// Actualizar préstamo
router.put('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const prestamoId = req.params.id;
    const { estado, observaciones } = req.body;

    try {
        const prestamo = await Loan.findById(prestamoId);
        if (!prestamo) {
            return res.status(404).json({ error: 'Préstamo no encontrado' });
        }

        const updates = {
            estado: estado || prestamo.estado,
            observaciones: observaciones || prestamo.observaciones
        };

        const updatedPrestamo = await prestamo.update(updates);
        res.json({
            message: 'Préstamo actualizado correctamente',
            prestamo: updatedPrestamo
        });
    } catch (error) {
        console.error('Error actualizando préstamo:', error);
        res.status(500).json({ error: 'Error actualizando préstamo' });
    }
});

// Obtener multas de un préstamo
router.get('/:id/multas', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const prestamoId = req.params.id;

    try {
        const multas = await Fine.findByLoanId(prestamoId, { estado: 'pendiente' });
        res.json(multas);
    } catch (error) {
        console.error('Error obteniendo multas:', error);
        res.status(500).json({ error: 'Error obteniendo multas' });
    }
});

//Obtener multas de un cliente
router.get('/cliente/:id/multas', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const multas = await Fine.findByClientId(clienteId);
        res.json(multas);
    } catch (error) {
        console.error('Error obteniendo multas:', error);
        res.status(500).json({ error: 'Error obteniendo multas' });
    }
});

// Crear multa para un préstamo
router.post('/:id/multas', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const prestamoId = req.params.id;
    const { fecha, monto, cliente_id } = req.body;

    if (!fecha || !monto) {
        return res.status(400).json({ error: 'Fecha y monto son campos requeridos' });
    }

    try {
        const prestamo = await Loan.findById(prestamoId);
        if (!prestamo) {
            return res.status(404).json({ error: 'Préstamo no encontrado' });
        }

        const multaData = {
            prestamo_id: prestamoId,
            fecha,
            monto,
            cliente_id,
            estado: 'pendiente'
        };

        const multa = await Fine.create(multaData);

        // Contar multas existentes para este préstamo
        const multasPendientes = await Fine.findByLoanId(prestamoId, { estado: 'pendiente' });
        const totalMultas = multasPendientes.length;

        const adeudosPendientes = await Adeudo.findByLoanId(prestamoId, { estado: 'pendiente' });
        const totalAdeudos = adeudosPendientes.length;

        const adeudosNecesarios = Math.floor(totalMultas / 3);

        for (let i = totalAdeudos; i < adeudosNecesarios; i++) {
            await Adeudo.create({
                prestamo_id: prestamoId,
                cliente_id: cliente_id,
                monto: prestamo.pago_diario,  // monto diario del préstamo
                fecha: null,
                estado: 'pendiente'
            });
        }

        // // Si el número de multas es múltiplo de 3, crear un adeudo
        // if (numeroMultas % 3 === 0) {
        //     // Obtener el préstamo para saber el monto
        //     const prestamo = await Loan.findById(prestamoId);

        //     // Crear el adeudo
        //     await Adeudo.create({
        //         // cliente_id: prestamo.cliente_id,
        //         prestamo_id: prestamoId,
        //         monto: prestamo.pago_diario, // Usar el monto del pago del préstamo
        //         fecha: null,
        //         estado: 'pendiente'
        //     });
        // }

        res.status(201).json({
            message: 'Multa creada exitosamente',
            multa
        });
    } catch (error) {
        console.error('Error creando multa:', error);
        res.status(500).json({ error: 'Error creando multa' });
    }
});

//Crear pago de multa
router.put('/multas/:multaId/pagar', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const { fine_id } = req.body;

    try {
        const multa = await Fine.findById(fine_id);
        if (!multa) {
            return res.status(404).json({ error: 'Multa no encontrada' });
        }

        const pagoData = {
            estado: 'pagado'
        };

        const pago = await multa.update(pagoData);

        res.status(201).json({
            message: 'Pago de multa creado exitosamente',
            pago
        });
    } catch (error) {
        console.error('Error creando pago de multa:', error);
        res.status(500).json({ error: 'Error creando pago de multa' });
    }
});

// Obtener abonos de un préstamo
router.get('/:id/abonos', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const prestamoId = req.params.id;

    try {
        const abonos = await Payment.findByLoanId(prestamoId);
        res.json(abonos);
    } catch (error) {
        console.error('Error obteniendo abonos:', error);
        res.status(500).json({ error: 'Error obteniendo abonos' });
    }
});

// Crear abono para un préstamo
router.post('/:id/abonos', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const prestamoId = req.params.id;
    const { monto, fecha } = req.body;

    if (!monto || !fecha) {
        return res.status(400).json({ error: 'Monto y fecha son campos requeridos' });
    }

    try {
        const prestamo = await Loan.findById(prestamoId);
        if (!prestamo) {
            return res.status(404).json({ error: 'Préstamo no encontrado' });
        }

        const abonoData = {
            prestamo_id: prestamoId,
            monto,
            fecha,
        };

        const abono = await Payment.create(abonoData);

        // Verificar si con este abono se completa el préstamo
        // Contar el número de pagos realizados
        const pagosRealizados = await Payment.findByLoanId(prestamoId);
        const numeroPagos = pagosRealizados.length;
        
        // Calcular la duración del préstamo en días
        const fechaInicio = new Date(prestamo.fecha_inicio);
        const fechaFin = new Date(prestamo.fecha_fin);
        const duracionDias = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
        
        // El préstamo se completa cuando se han hecho todos los pagos requeridos
        if (numeroPagos >= duracionDias) {
            await prestamo.update({ estado: 'completado' });
        }

        res.status(201).json({
            message: prestamo.estado === 'completado' ? 'Abono creado y préstamo completado' : 'Abono creado exitosamente',
            abono
        });
    } catch (error) {
        console.error('Error creando abono:', error);
        res.status(500).json({ error: 'Error creando abono' });
    }
});

// Obtener adeudos por préstamo
router.get('/:id/adeudos', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const adeudos = await Adeudo.findByLoanId(req.params.id);
        res.json(adeudos);
    } catch (error) {
        console.error('Error obteniendo adeudos:', error);
        res.status(500).json({
            error: 'Error obteniendo adeudos',
            message: error.message
        });
    }
});

// Obtener adeudos pendientes por cliente
router.get('/cliente/:id/adeudos', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const adeudos = await Adeudo.findByClientId(req.params.id);
        res.json(adeudos);
    } catch (error) {
        console.error('Error obteniendo adeudos pendientes:', error);
        res.status(500).json({
            error: 'Error obteniendo adeudos pendientes',
            message: error.message
        });
    }
});

// Marcar adeudo como pagado
router.put('/adeudos/:adeudoId/pagar', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const { fecha, debt_id } = req.body;

    if (!fecha) {
        return res.status(400).json({
            error: 'Fecha requerida',
            message: 'Se requiere la fecha de pago'
        });
    }

    try {
        const adeudo = new Adeudo({ id: debt_id });
        const adeudoActualizado = await adeudo.update({
            fecha,
            estado: 'pagado'
        });

        res.json({
            message: 'Adeudo actualizado exitosamente',
            adeudo: adeudoActualizado
        });
    } catch (error) {
        console.error('Error actualizando adeudo:', error);
        res.status(500).json({
            error: 'Error actualizando adeudo',
            message: error.message
        });
    }
});

// Liquidar préstamo
router.put('/:id/liquidar', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const prestamoId = req.params.id;
    const { monto } = req.body; // Monto personalizado opcional

    try {
        const prestamo = await Loan.findById(prestamoId);
        if (!prestamo) {
            return res.status(404).json({ error: 'Préstamo no encontrado' });
        }

        // Verificar que el préstamo no esté ya completado o liquidado
        if (prestamo.estado === 'completado' || prestamo.estado === 'liquidado') {
            return res.status(400).json({ error: 'El préstamo ya está finalizado' });
        }

        // Calcular el monto de liquidación si no se proporciona uno personalizado
        let montoLiquidacion = monto;
        if (!monto) {
            // Calcular cuántos pagos faltan por realizar
            const pagosRealizados = await Payment.findByLoanId(prestamoId);
            const numeroPagos = pagosRealizados.length;
            
            // Calcular la duración del préstamo en días
            const fechaInicio = new Date(prestamo.fecha_inicio);
            const fechaFin = new Date(prestamo.fecha_fin);
            const duracionDias = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
            
            // Calcular pagos pendientes y el monto de liquidación
            const pagosPendientes = Math.max(0, duracionDias - numeroPagos);
            montoLiquidacion = pagosPendientes * prestamo.pago_diario;
        }

        // Actualizar el estado del préstamo a liquidado
        const updatedPrestamo = await prestamo.update({ estado: 'liquidado' });

        res.json({
            message: 'Préstamo liquidado exitosamente',
            prestamo: updatedPrestamo,
            monto_liquidacion: parseFloat(montoLiquidacion)
        });
    } catch (error) {
        console.error('Error liquidando préstamo:', error);
        res.status(500).json({ 
            error: 'Error liquidando préstamo',
            message: error.message 
        });
    }
});

module.exports = router; 