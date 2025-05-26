const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');
const Fine = require('../models/Fine');
const Client = require('../models/Client');

// Obtener todos los préstamos
router.get('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const prestamos = await Loan.findByWorkerId(req.user.id);
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
        observaciones
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
            observaciones: observaciones || ''
        };

        const newPrestamo = await Loan.create(prestamoData);
        
        res.status(201).json({
            message: 'Préstamo creado exitosamente',
            prestamo: newPrestamo
        });
    } catch (error) {
        console.error('Error creando préstamo:', error);
        res.status(500).json({ 
            error: 'Error creando préstamo',
            message: error.message 
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
        const multas = await Fine.findByLoanId(prestamoId);
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
    const { fecha, monto } = req.body;

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
            monto
        };

        const multa = await Fine.create(multaData);
        res.status(201).json({
            message: 'Multa creada exitosamente',
            multa
        });
    } catch (error) {
        console.error('Error creando multa:', error);
        res.status(500).json({ error: 'Error creando multa' });
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
            fecha
        };

        const abono = await Payment.create(abonoData);
        
        // Verificar si con este abono se completa el préstamo
        const totalAbonos = await Payment.getTotalByLoanId(prestamoId);
        if (totalAbonos >= prestamo.monto + (prestamo.monto * prestamo.interes / 100)) {
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

module.exports = router; 