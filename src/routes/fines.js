const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Fine = require('../models/Fine');
const Loan = require('../models/Loan');
const Adeudo = require('../models/Adeudo');

// Crear nueva multa
router.post('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const { cliente_id, prestamo_id, monto } = req.body;

    if (!cliente_id || !prestamo_id || !monto) {
        return res.status(400).json({
            error: 'Campos requeridos faltantes',
            details: 'cliente_id, prestamo_id y monto son obligatorios'
        });
    }

    try {
        // Crear la multa
        const multa = await Fine.create({
            cliente_id,
            prestamo_id,
            monto,
            fecha: new Date()
        });

        // Contar multas existentes para este préstamo
        const multas = await Fine.findByLoanId(prestamo_id);
        const numeroMultas = multas.length;

        // Si el número de multas es múltiplo de 3, crear un adeudo
        if (numeroMultas % 3 === 0) {
            // Obtener el préstamo para saber el monto
            const prestamo = await Loan.findById(prestamo_id);
            
            // Crear el adeudo
            await Adeudo.create({
                cliente_id,
                prestamo_id,
                monto: prestamo.monto_pago, // Usar el monto del pago del préstamo
                fecha: null,
                estado: 'pendiente'
            });
        }

        res.status(201).json({
            message: 'Multa creada exitosamente',
            multa
        });
    } catch (error) {
        console.error('Error creando multa:', error);
        res.status(500).json({
            error: 'Error creando multa',
            message: error.message
        });
    }
});

// Obtener multas por préstamo
router.get('/prestamo/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const multas = await Fine.findByLoanId(req.params.id);
        res.json(multas);
    } catch (error) {
        console.error('Error obteniendo multas:', error);
        res.status(500).json({
            error: 'Error obteniendo multas',
            message: error.message
        });
    }
});

module.exports = router; 