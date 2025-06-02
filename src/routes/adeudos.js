const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Adeudo = require('../models/Adeudo');

// Obtener adeudos por préstamo
router.get('/prestamo/:id', authenticateJWT, async (req, res) => {
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
router.get('/cliente/:id/pendientes', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const adeudos = await Adeudo.findPendingByClientId(req.params.id);
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
router.put('/:id/pagar', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const { fecha } = req.body;

    if (!fecha) {
        return res.status(400).json({
            error: 'Fecha requerida',
            message: 'Se requiere la fecha de pago'
        });
    }

    try {
        const adeudo = new Adeudo({ id: req.params.id });
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

module.exports = router; 