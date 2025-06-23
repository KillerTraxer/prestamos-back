const express = require('express');
const router = express.Router();
const { auth } = require('../config/supabase');
const passwordUtils = require('../utils/password');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');
const Client = require('../models/Client');
const Loan = require('../models/Loan');

// Crear administrador (sin autenticación)
router.post('/admin', async (req, res) => {
    const { email, password, nombre, role } = req.body;

    if (!email || !password || !nombre) {
        return res.status(400).json({
            error: 'Datos incompletos',
            details: 'El email, contraseña y nombre son requeridos'
        });
    }

    console.log('Creando administrador desde panel admin:', email);

    try {
        // Verificar si ya existe en Auth
        const { data: existingList, error: listError } =
            await auth.supabaseAdmin.auth.admin.listUsers({ filter: `email=eq.${email}` });
        if (listError) throw listError;

        if (existingList.users.length > 0) {
            return res.status(400).json({ 
                error: 'Email ya registrado',
                message: 'Ya existe un usuario con este email' 
            });
        }

        // Crear usuario en Supabase Auth
        const { data: signupData, error: signupError } = await auth.signUp(email, password, {
            nombre,
            role: role || 'admin'
        });

        if (signupError || !signupData.user) {
            return res.status(400).json({ 
                error: 'Error al registrar usuario', 
                details: signupError?.message 
            });
        }

        // Crear usuario en la base de datos
        const newUserData = {
            email,
            nombre,
            role: role || 'admin',
            auth_id: signupData.user.id,
            status: 'active',
            password
        };

        const user = await User.create(newUserData);

        return res.status(201).json({
            message: 'Administrador creado exitosamente',
            user: {
                id: user.id,
                email: user.email,
                nombre: user.nombre,
                role: user.role,
                status: user.status,
                created_at: user.created_at
            }
        });
    } catch (error) {
        console.error('Error creando administrador:', error);
        return res.status(500).json({ 
            error: 'Error interno', 
            message: error.message 
        });
    }
});

// Crear trabajador (sin autenticación)
router.post('/trabajador', async (req, res) => {
    const { nombre, email, password, phone, status, usuario_id } = req.body;

    if (!nombre || !email || !password || !phone || !usuario_id) {
        return res.status(400).json({
            error: 'Campos requeridos faltantes',
            details: 'nombre, email, password, phone y usuario_id son obligatorios'
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
                details: 'Ya existe un usuario con este email en el sistema'
            });
        }

        // Crear usuario en Supabase Auth
        console.log('Creando trabajador en Auth...');
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
            usuario_id: usuario_id,
            auth_id: authData.user.id
        });

        res.status(201).json({
            message: 'Trabajador creado exitosamente',
            trabajador: {
                id: trabajador.id,
                nombre: trabajador.nombre,
                email: trabajador.email,
                phone: trabajador.phone,
                status: trabajador.status,
                usuario_id: trabajador.usuario_id,
                auth_id: trabajador.auth_id,
                created_at: trabajador.created_at
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

// Crear cliente (sin autenticación)
router.post('/cliente', async (req, res) => {
    const { nombre, direccion, telefono, ocupacion, trabajador_id } = req.body;

    if (!nombre || !direccion || !telefono || !ocupacion || !trabajador_id) {
        return res.status(400).json({ 
            error: 'Faltan campos requeridos',
            details: 'nombre, direccion, telefono, ocupacion y trabajador_id son obligatorios'
        });
    }

    try {
        const clientData = {
            nombre,
            direccion,
            telefono,
            ocupacion,
            trabajador_id
        };

        const newClient = await Client.create(clientData);
        
        res.status(201).json({
            message: 'Cliente creado exitosamente',
            client: {
                id: newClient.id,
                nombre: newClient.nombre,
                direccion: newClient.direccion,
                telefono: newClient.telefono,
                ocupacion: newClient.ocupacion,
                trabajador_id: newClient.trabajador_id,
                created_at: newClient.created_at
            }
        });
    } catch (error) {
        console.error('Error creando cliente:', error);
        res.status(500).json({ 
            error: 'Error creando cliente',
            message: error.message 
        });
    }
});

// Crear préstamo (sin autenticación)
router.post('/prestamo', async (req, res) => {
    const { 
        cliente_id, 
        trabajador_id, 
        monto, 
        interes, 
        fecha_inicio, 
        fecha_fin, 
        observaciones, 
        pago_diario,
        es_registro_manual,
        estado
    } = req.body;

    if (!cliente_id || !trabajador_id || !monto || !interes || !fecha_inicio || !fecha_fin || !pago_diario) {
        return res.status(400).json({
            error: 'Campos requeridos faltantes',
            details: 'cliente_id, trabajador_id, monto, interes, fecha_inicio, fecha_fin y pago_diario son obligatorios'
        });
    }

    try {
        const loanData = {
            cliente_id,
            trabajador_id,
            monto,
            interes,
            fecha_inicio,
            fecha_fin,
            observaciones: observaciones || '',
            pago_diario,
            es_registro_manual: es_registro_manual || false,
            estado: estado || 'activo'
        };

        const newLoan = await Loan.create(loanData);

        res.status(201).json({
            message: 'Préstamo creado exitosamente',
            loan: {
                id: newLoan.id,
                cliente_id: newLoan.cliente_id,
                trabajador_id: newLoan.trabajador_id,
                monto: newLoan.monto,
                interes: newLoan.interes,
                fecha_inicio: newLoan.fecha_inicio,
                fecha_fin: newLoan.fecha_fin,
                estado: newLoan.estado,
                observaciones: newLoan.observaciones,
                pago_diario: newLoan.pago_diario,
                es_registro_manual: newLoan.es_registro_manual,
                created_at: newLoan.created_at
            }
        });
    } catch (error) {
        console.error('Error creando préstamo:', error);
        res.status(500).json({
            error: 'Error creando préstamo',
            message: error.message
        });
    }
});

module.exports = router; 