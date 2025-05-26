const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Client = require('../models/Client');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Fine = require('../models/Fine');

// Obtener estadísticas generales
router.get('/general', authenticateJWT, async (req, res) => {
    try {
        const clientes = await Client.findAll();
        
        // Procesar los datos para incluir cálculos adicionales
        const processedStats = await Promise.all(clientes.map(async (cliente) => {
            const fechaInicio = new Date(cliente.fecha_inicio);
            const fechaTermino = new Date(cliente.fecha_termino);
            const diasPrestamo = Math.ceil((fechaTermino - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
            
            let cobroDiario = null;
            if (diasPrestamo === 15 || diasPrestamo === 20) {
                cobroDiario = (cliente.monto_inicial * 1.30) / diasPrestamo;
            }

            const multas = await Fine.findByClientId(cliente.id);
            const abonos = await Payment.findByClientId(cliente.id);
            const totalMultas = multas.length;
            const totalAbonos = abonos.reduce((sum, abono) => sum + abono.monto, 0);

            return {
                ...cliente,
                dias_prestamo: diasPrestamo,
                cobro_diario: cobroDiario ? Number(cobroDiario.toFixed(2)) : null,
                total_multas: totalMultas,
                total_abonos: totalAbonos
            };
        }));

        console.log(`Obtenidas ${processedStats.length} estadísticas generales`);
        res.json(processedStats);
    } catch (error) {
        console.error('Error obteniendo estadísticas generales:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas generales' });
    }
});

// Obtener estadísticas de trabajadores
router.get('/trabajadores', authenticateJWT, async (req, res) => {
    try {
        const trabajadores = await User.findAllWorkers();
        
        // Procesar los datos para incluir totales
        const processedStats = await Promise.all(trabajadores.map(async (trabajador) => {
            const clientes = await Client.findByWorkerId(trabajador.id);
            
            const totales = await clientes.reduce(async (accPromise, cliente) => {
                const acc = await accPromise;
                const abonos = await Payment.findByClientId(cliente.id);
                const multas = await Fine.findByClientId(cliente.id);
                
                const multasHoy = multas.filter(m => 
                    new Date(m.fecha).toDateString() === new Date().toDateString()
                ).length;

                const multasSemanales = multas.filter(m => {
                    const multaDate = new Date(m.fecha);
                    const today = new Date();
                    const diffTime = Math.abs(today - multaDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays <= 7;
                }).length;

                const abonosHoy = abonos.filter(a => 
                    new Date(a.fecha).toDateString() === new Date().toDateString()
                ).reduce((sum, a) => sum + a.monto, 0);

                const abonosSemanales = abonos.filter(a => {
                    const abonoDate = new Date(a.fecha);
                    const today = new Date();
                    const diffTime = Math.abs(today - abonoDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays <= 7;
                }).reduce((sum, a) => sum + a.monto, 0);

                return {
                    total_abonos_diarios: acc.total_abonos_diarios + abonosHoy,
                    total_abonos_semanales: acc.total_abonos_semanales + abonosSemanales,
                    total_multas_hoy: acc.total_multas_hoy + multasHoy,
                    total_multas_semanales: acc.total_multas_semanales + multasSemanales
                };
            }, Promise.resolve({
                total_abonos_diarios: 0,
                total_abonos_semanales: 0,
                total_multas_hoy: 0,
                total_multas_semanales: 0
            }));

            return {
                trabajador_id: trabajador.id,
                trabajador_nombre: trabajador.nombre,
                ...totales
            };
        }));

        console.log(`Obtenidas ${processedStats.length} estadísticas de trabajadores`);
        res.json(processedStats);
    } catch (error) {
        console.error('Error obteniendo estadísticas de trabajadores:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas de trabajadores' });
    }
});

// Obtener estadísticas de un cliente específico
router.get('/cliente/:id', authenticateJWT, async (req, res) => {
    const clienteId = req.params.id;

    try {
        const cliente = await Client.findById(clienteId);
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const multas = await Fine.findByClientId(clienteId);
        const abonos = await Payment.findByClientId(clienteId);
        const stats = {
            ...cliente,
            total_multas: multas.length,
            total_abonos: abonos.reduce((sum, abono) => sum + abono.monto, 0),
            historial_abonos: abonos,
            historial_multas: multas
        };

        console.log(`Obtenidas estadísticas del cliente ${clienteId}`);
        res.json(stats);
    } catch (error) {
        console.error('Error obteniendo estadísticas del cliente:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas del cliente' });
    }
});

// Obtener estadísticas de un trabajador específico
router.get('/trabajador/:id', authenticateJWT, async (req, res) => {
    const trabajadorId = req.params.id;

    try {
        const trabajador = await User.findById(trabajadorId);
        if (!trabajador) {
            return res.status(404).json({ error: 'Trabajador no encontrado' });
        }

        const clientes = await Client.findByWorkerId(trabajadorId);
        const stats = {
            ...trabajador,
            total_clientes: clientes.length,
            clientes: await Promise.all(clientes.map(async (cliente) => {
                const multas = await Fine.findByClientId(cliente.id);
                const abonos = await Payment.findByClientId(cliente.id);
                return {
                    ...cliente,
                    total_multas: multas.length,
                    total_abonos: abonos.reduce((sum, abono) => sum + abono.monto, 0)
                };
            }))
        };

        console.log(`Obtenidas estadísticas del trabajador ${trabajadorId}`);
        res.json(stats);
    } catch (error) {
        console.error('Error al obtener estadísticas del trabajador:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas del trabajador' });
    }
});

module.exports = router; 