const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateJWT } = require('../middleware/auth');
const Client = require('../models/Client');
const { auth } = require('../config/supabase');
const Loan = require('../models/Loan');
const Payment = require('../models/Payment');
const Fine = require('../models/Fine');

// Configurar almacenamiento de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
            return cb(new Error('Solo se permiten archivos de imagen (jpg, jpeg, png)'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

// Obtener todos los clientes
router.get('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    try {
        let clientes;
        // Si es admin y hay un collectorId, obtener clientes de ese trabajador
        if (req.user.role === 'admin' && req.query.collectorId) {
            clientes = await Client.findByWorkerId(req.query.collectorId);
        } else {
            // Si no es admin o no hay collectorId, obtener clientes del trabajador actual
            clientes = await Client.findByWorkerId(req.user.id);
        }
        res.json(clientes);
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({ error: 'Error obteniendo clientes' });
    }
});

// Crear nuevo cliente
router.post('/', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const {
        nombre,
        direccion,
        telefono,
        // telefono_familiar,
        ocupacion,
        trabajador_id
    } = req.body;

    if (!nombre || !direccion || !telefono || 
        !ocupacion || !trabajador_id) {
        return res.status(400).json({ 
            error: 'Faltan campos requeridos o archivos necesarios'
        });
    }

    // if (!req.files.comprobante_domicilio || !req.files.ine) {
    //     return res.status(400).json({ 
    //         error: 'Se requieren ambos archivos: comprobante de domicilio e INE'
    //     });
    // }

    try {
        // const comprobanteFile = req.files.comprobante_domicilio[0];
        // const ineFile = req.files.ine[0];

        // const { data: comprobanteData, error: comprobanteError } = await auth.storage
        //     .from('documentos')
        //     .upload(`comprobantes/${comprobanteFile.filename}`, comprobanteFile.buffer, {
        //         contentType: comprobanteFile.mimetype
        //     });

        // if (comprobanteError) throw comprobanteError;

        // const { data: ineData, error: ineError } = await auth.storage
        //     .from('documentos')
        //     .upload(`ine/${ineFile.filename}`, ineFile.buffer, {
        //         contentType: ineFile.mimetype
        //     });

        // if (ineError) throw ineError;

        const clientData = {
            nombre,
            direccion,
            telefono,
            // telefono_familiar,
            ocupacion,
            trabajador_id,
            // comprobante_domicilio_url: comprobanteData.path,
            // ine_url: ineData.path
        };

        const newClient = await Client.create(clientData);
        
        res.status(201).json({
            message: 'Cliente creado exitosamente',
            client: newClient
        });
    } catch (error) {
        console.error('Error creando cliente:', error);
        res.status(500).json({ 
            error: 'Error creando cliente',
            message: error.message 
        });
    }
});

// Obtener cliente por ID
router.get('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const cliente = await Client.findById(clienteId);
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // Buscar el préstamo activo del cliente
        const prestamo = await Loan.findActiveByClientId(clienteId);
        
        let paymentProgress = 0;
        let totalPayments = 0;
        let penalties = 0;

        if (prestamo) {
            // Obtener los abonos del préstamo
            const abonos = await Payment.findByLoanId(prestamo.id);
            paymentProgress = abonos.length;

            // Calcular el total de pagos requeridos basado en la duración del préstamo
            const fechaInicio = new Date(prestamo.fecha_inicio);
            const fechaFin = new Date(prestamo.fecha_fin);
            // Calcular la diferencia en días y sumar 1 para incluir el día final
            totalPayments = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;

            // Obtener el total de multas
            const multas = await Fine.findByLoanId(prestamo.id);
            penalties = multas.length;
        }

        res.json({
            ...cliente,
            paymentProgress,
            totalPayments,
            penalties
        });
    } catch (error) {
        console.error('Error obteniendo cliente:', error);
        res.status(500).json({ error: 'Error obteniendo cliente' });
    }
});

// Actualizar cliente
router.put('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;
    const { nombre, direccion, telefono, telefono_familiar, ocupacion } = req.body;

    try {
        const cliente = await Client.findById(clienteId);
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        console.log('Client trabajador_id:', cliente.trabajador_id, 'Current user ID:', req.user.id);
        
        // Verificar que el trabajador puede editar este cliente
        if (req.user.role === 'trabajador' && cliente.trabajador_id !== req.user.id) {
            console.log('Permission denied: Client belongs to different worker');
            return res.status(403).json({ error: 'No tienes permisos para editar este cliente' });
        }

        const updates = {
            nombre,
            direccion,
            telefono,
            telefono_familiar,
            ocupacion
        };

        const updatedClient = await cliente.update(updates);
        res.json({ 
            message: 'Cliente actualizado correctamente',
            client: updatedClient
        });
    } catch (error) {
        console.error('Error actualizando cliente:', error);
        res.status(500).json({ error: 'Error actualizando cliente' });
    }
});

// Eliminar cliente
router.delete('/:id', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    try {
        const cliente = await Client.findById(clienteId);
        if (!cliente) {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }

        await cliente.delete();
        res.json({ message: 'Cliente eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando cliente:', error);
        res.status(500).json({ error: 'Error eliminando cliente' });
    }
});

module.exports = router; 