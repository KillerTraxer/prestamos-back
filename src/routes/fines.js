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

// Eliminar multa (soft delete)
router.delete('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        // Buscar la multa a eliminar
        const multa = await Fine.findById(req.params.id);
        if (!multa) {
            return res.status(404).json({
                error: 'Multa no encontrada'
            });
        }

        const { prestamo_id, cliente_id } = multa;

        // Eliminar la multa (soft delete)
        await multa.softDelete();

        // Contar multas activas restantes para este préstamo
        const multasActivas = await Fine.findByLoanId(prestamo_id);
        const numeroMultasActivas = multasActivas.length;

        // Obtener adeudos pendientes para este préstamo
        const adeudosPendientes = await Adeudo.findByLoanId(prestamo_id, { estado: 'pendiente' });
        
        // Calcular cuántos adeudos deberían existir basándose en las multas actuales
        const adeudosEsperados = Math.floor(numeroMultasActivas / 3);
        const adeudosActuales = adeudosPendientes.length;

        // Si hay más adeudos de los que deberían existir, eliminar los excedentes
        if (adeudosActuales > adeudosEsperados) {
            const adeudosAEliminar = adeudosActuales - adeudosEsperados;
            
            // Ordenar adeudos por fecha de creación (los más recientes primero) y eliminar los necesarios
            adeudosPendientes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            for (let i = 0; i < adeudosAEliminar; i++) {
                await adeudosPendientes[i].softDelete();
            }
        }

        res.json({
            message: 'Multa eliminada exitosamente',
            multasRestantes: numeroMultasActivas,
            adeudosEliminados: Math.max(0, adeudosActuales - adeudosEsperados)
        });
    } catch (error) {
        console.error('Error eliminando multa:', error);
        res.status(500).json({
            error: 'Error eliminando multa',
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

// Obtener multas por cliente
router.get('/cliente/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const multas = await Fine.findByClientId(req.params.id);
        res.json(multas);
    } catch (error) {
        console.error('Error obteniendo multas del cliente:', error);
        res.status(500).json({
            error: 'Error obteniendo multas del cliente',
            message: error.message
        });
    }
});

module.exports = router; 