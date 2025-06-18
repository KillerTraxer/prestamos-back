const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Trabajador = require('../models/Trabajador');
const Client = require('../models/Client');
const Movimiento = require('../models/Movimiento');
const passwordUtils = require('../utils/password');
const { auth } = require('../config/supabase');
const moment = require('moment-timezone');

// Obtener todos los trabajadores
router.get('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    console.log(req.user);

    try {
        // Verificar cache primero
        const authCache = require('../utils/auth-cache');
        const cachedWorkers = authCache.getChartData(req.user.id, 'admin', 'workers_list', 'all');
        if (cachedWorkers) {
            console.log('👷 Lista de trabajadores obtenida desde cache');
            return res.json(cachedWorkers);
        }
        // Obtener solo los trabajadores asociados al admin que hace la petición
        const trabajadores = await Trabajador.findAll({
            usuario_id: req.user.id
        });

        // Para cada trabajador, obtener el conteo de sus clientes
        const trabajadoresConConteo = await Promise.all(
            trabajadores.map(async (trabajador) => {
                const clientes = await Client.findByWorkerId(trabajador.id);
                return {
                    ...trabajador,
                    clients_count: clientes.length
                };
            })
        );

        // Guardar en cache
        authCache.setChartData(req.user.id, 'admin', 'workers_list', 'all', trabajadoresConConteo);
        console.log('👷 Lista de trabajadores guardada en cache');
        
        res.json(trabajadoresConConteo);
    } catch (error) {
        console.error('Error obteniendo datos de trabajadores:', error);
        res.status(500).json({
            error: 'Error obteniendo datos de trabajadores',
            message: error.message
        });
    }
});

// Obtener recolecciones diarias de todos los trabajadores
router.get('/daily-collections', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        // Verificar cache primero
        const authCache = require('../utils/auth-cache');
        const cachedCollections = authCache.getChartData(req.user.id, 'admin', 'daily_collections', 'today');
        if (cachedCollections) {
            console.log('📊 Recolecciones diarias obtenidas desde cache');
            return res.json(cachedCollections);
        }
        // Obtener fecha de hoy en timezone de México y convertir a UTC
        const ahora = moment().tz('America/Mexico_City');
        const inicioHoyLocal = ahora.clone().startOf('day');
        const finHoyLocal = ahora.clone().endOf('day');
        
        // Convertir a UTC para consultas en base de datos
        const inicioHoyUTC = inicioHoyLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');
        const finHoyUTC = finHoyLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');
        
        console.log('📅 Conversión de fechas para daily collections:', {
            inicioHoyLocal: inicioHoyLocal.format('YYYY-MM-DD HH:mm:ss'),
            finHoyLocal: finHoyLocal.format('YYYY-MM-DD HH:mm:ss'),
            inicioHoyUTC,
            finHoyUTC
        });
        
        // Obtener movimientos de recolección del día para trabajadores del admin (usando fechas UTC)
        const movimientos = await Movimiento.getCollectionsByAdminAndDateRange(req.user.id, inicioHoyUTC, finHoyUTC);
        
        // Agrupar por trabajador y sumar las recolecciones
        const recoleccionesPorTrabajador = {};
        
        movimientos.forEach(movimiento => {
            const trabajadorId = movimiento.usuario_id;
            if (!recoleccionesPorTrabajador[trabajadorId]) {
                recoleccionesPorTrabajador[trabajadorId] = 0;
            }
            recoleccionesPorTrabajador[trabajadorId] += parseFloat(movimiento.monto);
        });

        const result = { recolecciones: recoleccionesPorTrabajador };
        
        // Guardar en cache
        authCache.setChartData(req.user.id, 'admin', 'daily_collections', 'today', result);
        console.log('📊 Recolecciones diarias guardadas en cache');
        
        res.json(result);
    } catch (error) {
        console.error('Error obteniendo recolecciones diarias:', error);
        res.status(500).json({
            error: 'Error obteniendo recolecciones diarias',
            message: error.message
        });
    }
});

// Obtener recolecciones mensuales de todos los trabajadores
router.get('/monthly-collections', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        // Verificar cache primero
        const authCache = require('../utils/auth-cache');
        const cachedCollections = authCache.getChartData(req.user.id, 'admin', 'monthly_collections', 'this_month');
        if (cachedCollections) {
            console.log('📊 Recolecciones mensuales obtenidas desde cache');
            return res.json(cachedCollections);
        }
        // Obtener fecha de inicio y fin del mes actual en timezone de México y convertir a UTC
        const ahora = moment().tz('America/Mexico_City');
        const inicioMesLocal = ahora.clone().startOf('month');
        const finMesLocal = ahora.clone().endOf('month');
        
        // Convertir a UTC para consultas en base de datos
        const inicioMesUTC = inicioMesLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');
        const finMesUTC = finMesLocal.clone().utc().format('YYYY-MM-DD HH:mm:ss');
        
        console.log('📅 Conversión de fechas para monthly collections:', {
            inicioMesLocal: inicioMesLocal.format('YYYY-MM-DD HH:mm:ss'),
            finMesLocal: finMesLocal.format('YYYY-MM-DD HH:mm:ss'),
            inicioMesUTC,
            finMesUTC
        });
        
        // Obtener movimientos de recolección del mes para trabajadores del admin (usando fechas UTC)
        const movimientos = await Movimiento.getCollectionsByAdminAndDateRange(req.user.id, inicioMesUTC, finMesUTC);
        
        // Agrupar por trabajador y sumar las recolecciones
        const recoleccionesPorTrabajador = {};
        
        movimientos.forEach(movimiento => {
            const trabajadorId = movimiento.usuario_id;
            if (!recoleccionesPorTrabajador[trabajadorId]) {
                recoleccionesPorTrabajador[trabajadorId] = 0;
            }
            recoleccionesPorTrabajador[trabajadorId] += parseFloat(movimiento.monto);
        });

        const result = { recolecciones: recoleccionesPorTrabajador };
        
        // Guardar en cache
        authCache.setChartData(req.user.id, 'admin', 'monthly_collections', 'this_month', result);
        console.log('📊 Recolecciones mensuales guardadas en cache');
        
        res.json(result);
    } catch (error) {
        console.error('Error obteniendo recolecciones mensuales:', error);
        res.status(500).json({
            error: 'Error obteniendo recolecciones mensuales',
            message: error.message
        });
    }
});

// Obtener balance de dinero de un trabajador
router.get('/:id/balance', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;

    try {
        const trabajador = await Trabajador.findById(trabajadorId);
        if (!trabajador) {
            return res.status(404).json({ error: 'Trabajador no encontrado' });
        }

        // Verificar que el trabajador pertenece al admin que hace la petición
        if (trabajador.usuario_id !== req.user.id) {
            return res.status(403).json({ error: 'No tienes permiso para ver este trabajador' });
        }

        const balance = await Movimiento.getWorkerBalance(trabajadorId, req.user.id);
        res.json({ balance });
    } catch (error) {
        console.error('Error obteniendo balance del trabajador:', error);
        res.status(500).json({ 
            error: 'Error obteniendo balance del trabajador',
            message: error.message 
        });
    }
});

// Obtener clientes de un trabajador
router.get('/:id/clientes', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;

    try {
        const trabajador = await Trabajador.findById(trabajadorId);
        if (!trabajador) {
            return res.status(404).json({ error: 'Trabajador no encontrado' });
        }

        const clientes = await Client.findByWorkerId(trabajadorId);
        console.log(`Obtenidos ${clientes.length} clientes para el trabajador con ID: ${trabajadorId}`);
        res.json(clientes);
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({ error: 'Error obteniendo clientes' });
    }
});

// Crear nuevo trabajador
router.post('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { nombre, email, password, phone, status } = req.body;

    if (!nombre || !email || !password || !phone) {
        return res.status(400).json({
            error: 'Campos requeridos faltantes',
            details: 'nombre, email, password y phone son obligatorios'
        });
    }

    try {
        // Verificar si ya existe en Auth
        const { data: authUsers, error: authError } = await auth.supabaseAdmin.auth.admin.listUsers({ filter: `email=eq.${email}` });
        if (authError) throw authError;

        const existingAuthUser = authUsers.users.find(u => u.email === email);
        if (existingAuthUser) {
            return res.status(400).json({
                error: 'Usuario ya registrado',
                details: 'Ya existe un usuario con este email en el sistema de autenticación'
            });
        }

        // Crear usuario en Supabase Auth
        console.log('Creando usuario en Auth...');
        const { data: authData, error: signUpError } = await auth.signUp(email, password, {
            nombre: nombre,
            role: 'trabajador'
        });

        if (signUpError || !authData?.user) {
            return res.status(400).json({
                error: 'Error en Supabase Auth',
                message: signUpError?.message || 'No se pudo crear el usuario en Supabase Auth'
            });
        }

        // Crear trabajador en la base de datos
        const trabajador = await Trabajador.create({
            nombre,
            email,
            password,
            phone,
            status: status || 'active',
            usuario_id: req.user.id,
            auth_id: authData.user.id
        });

        // Invalidar cache de trabajadores para que aparezcan inmediatamente
        const authCache = require('../utils/auth-cache');
        authCache.invalidateWorkersCache(req.user.id);

        res.status(201).json({
            message: 'Trabajador creado',
            trabajador: {
                id: trabajador.id,
                nombre: trabajador.nombre,
                email: trabajador.email,
                phone: trabajador.phone,
                status: trabajador.status,
                usuario_id: trabajador.usuario_id,
                auth_id: trabajador.auth_id
            }
        });
    } catch (error) {
        console.error('Error creando trabajador:', error);
        res.status(500).json({
            error: 'Error creando trabajador',
            message: error.message
        });
    }
});

// Actualizar trabajador
router.put('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;
    const { nombre, email, status, phone } = req.body;

    if (!nombre || !email) {
        return res.status(400).json({
            error: 'Campos requeridos',
            message: 'Los campos nombre y email son requeridos'
        });
    }

    try {
        const trabajador = await Trabajador.findById(trabajadorId);
        if (!trabajador) {
            return res.status(404).json({
                error: 'Trabajador no encontrado',
                message: 'No existe un trabajador con el ID proporcionado'
            });
        }

        if (email !== trabajador.email) {
            const existingUser = await Trabajador.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({
                    error: 'Email duplicado',
                    message: 'El email ya está registrado por otro usuario'
                });
            }
        }

        const updatedTrabajador = await trabajador.update({
            nombre,
            email,
            status: status || trabajador.status,
            phone: phone || trabajador.phone
        });

        // Invalidar cache de trabajadores después de actualizar
        const authCache = require('../utils/auth-cache');
        authCache.invalidateWorkersCache(req.user.id);

        res.json({
            message: 'Trabajador actualizado exitosamente',
            trabajador: {
                id: updatedTrabajador.id,
                nombre: updatedTrabajador.nombre,
                email: updatedTrabajador.email,
                status: updatedTrabajador.status,
                phone: updatedTrabajador.phone
            }
        });
    } catch (error) {
        console.error('Error actualizando trabajador:', error);
        res.status(500).json({
            error: 'Error actualizando trabajador',
            message: error.message
        });
    }
});

// Eliminar trabajador
router.delete('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;

    try {
        const trabajador = await Trabajador.findById(trabajadorId);
        if (!trabajador) {
            return res.status(404).json({
                error: 'Trabajador no encontrado',
                message: 'No existe un trabajador con el ID proporcionado'
            });
        }

        const clientes = await Client.findByWorkerId(trabajadorId);
        if (clientes.length > 0) {
            return res.status(400).json({
                error: 'No se puede eliminar el trabajador',
                message: 'El trabajador tiene clientes asociados. Elimine o transfiera los clientes primero.'
            });
        }

        await trabajador.delete();
        
        // Invalidar cache de trabajadores después de eliminar
        const authCache = require('../utils/auth-cache');
        authCache.invalidateWorkersCache(req.user.id);
        
        res.json({
            message: 'Trabajador y cuenta de autenticación eliminados exitosamente',
            id: trabajadorId
        });
    } catch (error) {
        console.error('Error eliminando trabajador:', error);

        // Provide more specific error messages based on the error type
        if (error.message && error.message.includes('auth')) {
            res.status(500).json({
                error: 'Error eliminando cuenta de autenticación',
                message: error.message
            });
        } else {
            res.status(500).json({
                error: 'Error eliminando trabajador',
                message: error.message
            });
        }
    }
});

module.exports = router; 