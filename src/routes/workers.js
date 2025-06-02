const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Trabajador = require('../models/Trabajador');
const Client = require('../models/Client');
const passwordUtils = require('../utils/password');
const { auth } = require('../config/supabase');

// Obtener todos los trabajadores
router.get('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    console.log(req.user);

    try {
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

        res.json(trabajadoresConConteo);
    } catch (error) {
        console.error('Error obteniendo datos de trabajadores:', error);
        res.status(500).json({
            error: 'Error obteniendo datos de trabajadores',
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