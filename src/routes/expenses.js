const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Expense = require('../models/Expense');
const Movimiento = require('../models/Movimiento');
// const moment = require('moment-timezone');

// Get all expenses
router.get('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        let expenses;
        if (req.user.role === 'admin' && req.query.trabajadorId) {
            expenses = await Expense.findAll(req.query.trabajadorId);
        } else {
            expenses = await Expense.findAll(req.user.id);
        }
        res.json(expenses);
    } catch (error) {
        console.error('Error getting expenses:', error);
        res.status(500).json({ error: 'Error al obtener gastos' });
    }
});

// Get expense by ID
router.get('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const expense = await Expense.findById(req.params.id);
        
        // Check if user has access to this expense
        if (req.user.role !== 'admin' && expense.trabajador_id !== req.user.id) {
            return res.sendStatus(403);
        }
        
        res.json(expense);
    } catch (error) {
        console.error('Error getting expense:', error);
        if (error.message === 'Gasto no encontrado') {
            res.status(404).json({ error: 'Gasto no encontrado' });
        } else {
            res.status(500).json({ error: 'Error al obtener gasto' });
        }
    }
});

// Create expense
router.post('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const { monto, descripcion, tipo } = req.body;

        // Validate required fields
        if (!monto || !descripcion || !tipo) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }

        // Create expense
        const expense = await Expense.create({
            trabajador_id: req.user.id,
            monto,
            descripcion,
            tipo
        });

        // // Create movimiento
        // await Movimiento.create({
        //     tipo_movimiento: 'gasto_operativo',
        //     monto: expense.monto,
        //     // fecha: moment().tz('America/Mexico_City').format(),
        //     usuario_id: req.user.id,
        //     referencia_id: expense.id
        // });

        res.status(201).json(expense);
    } catch (error) {
        console.error('Error creating expense:', error);
        res.status(500).json({ error: 'Error al crear gasto' });
    }
});

// Update expense
router.put('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const expense = await Expense.findById(req.params.id);
        
        // Check if user has access to this expense
        if (req.user.role !== 'admin' && expense.trabajador_id !== req.user.id) {
            return res.sendStatus(403);
        }

        const { monto, descripcion, tipo } = req.body;
        const updatedExpense = await Expense.update(req.params.id, {
            monto: monto || expense.monto,
            descripcion: descripcion || expense.descripcion,
            tipo: tipo || expense.tipo
        });

        res.json(updatedExpense);
    } catch (error) {
        console.error('Error updating expense:', error);
        if (error.message === 'Gasto no encontrado') {
            res.status(404).json({ error: 'Gasto no encontrado' });
        } else {
            res.status(500).json({ error: 'Error al actualizar gasto' });
        }
    }
});

// Delete expense
router.delete('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const expense = await Expense.findById(req.params.id);
        
        // Check if user has access to this expense
        if (req.user.role !== 'admin' && expense.trabajador_id !== req.user.id) {
            return res.sendStatus(403);
        }

        await Expense.delete(req.params.id);
        res.sendStatus(204);
    } catch (error) {
        console.error('Error deleting expense:', error);
        if (error.message === 'Gasto no encontrado') {
            res.status(404).json({ error: 'Gasto no encontrado' });
        } else {
            res.status(500).json({ error: 'Error al eliminar gasto' });
        }
    }
});

module.exports = router; 