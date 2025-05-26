const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const { auth } = require('../config/supabase');
const Client = require('../models/Client');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Fine = require('../models/Fine');

// Crear backup
router.post('/create', authenticateJWT, async (req, res) => {
    try {
        // Verificar que el usuario es administrador
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
        }

        // Obtener todos los datos
        const users = await User.findAll();
        const clients = await Client.findAll();
        const payments = await Payment.findAll();
        const fines = await Fine.findAll();

        // Crear el objeto de backup
        const backupData = {
            timestamp: new Date().toISOString(),
            data: {
                users,
                clients,
                payments,
                fines
            }
        };

        // Guardar el backup en Supabase Storage
        const fileName = `backup-${backupData.timestamp}.json`;
        const { data, error } = await auth.storage
            .from('backups')
            .upload(fileName, JSON.stringify(backupData, null, 2));

        if (error) throw error;

        res.json({ 
            message: 'Backup creado exitosamente',
            fileName,
            url: data.path
        });
    } catch (error) {
        console.error('Error creando backup:', error);
        res.status(500).json({ 
            error: 'Error creando backup',
            message: error.message
        });
    }
});

// Restaurar backup
router.post('/restore', authenticateJWT, async (req, res) => {
    try {
        // Verificar que el usuario es administrador
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
        }

        const { backupFile } = req.body;
        if (!backupFile) {
            return res.status(400).json({ error: 'Se requiere especificar el archivo de backup' });
        }

        // Obtener el archivo de backup
        const { data, error: downloadError } = await auth.storage
            .from('backups')
            .download(backupFile);

        if (downloadError) throw downloadError;

        // Parsear el contenido del backup
        const backupData = JSON.parse(await data.text());

        // Eliminar datos existentes
        await auth.supabaseAdmin.from('multas').delete().neq('id', 0);
        await auth.supabaseAdmin.from('abonos').delete().neq('id', 0);
        await auth.supabaseAdmin.from('clientes').delete().neq('id', 0);
        await auth.supabaseAdmin.from('usuarios').delete().neq('id', 0);

        // Restaurar datos
        for (const user of backupData.data.users) {
            await User.create(user);
        }

        for (const client of backupData.data.clients) {
            await Client.create(client);
        }

        for (const payment of backupData.data.payments) {
            await Payment.create(payment);
        }

        for (const fine of backupData.data.fines) {
            await Fine.create(fine);
        }

        res.json({ 
            message: 'Restauración completada exitosamente',
            timestamp: backupData.timestamp
        });
    } catch (error) {
        console.error('Error restaurando backup:', error);
        res.status(500).json({ 
            error: 'Error restaurando backup',
            message: error.message
        });
    }
});

module.exports = router; 