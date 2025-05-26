const { auth } = require('../config/supabase');
const Client = require('../models/Client');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Fine = require('../models/Fine');
const fs = require('fs').promises;
const path = require('path');

/**
 * Crea un backup de la base de datos
 * @param {string} backupDir - Directorio donde se guardará el backup
 * @returns {Promise<Object>} - Información del backup creado
 */
const createBackup = async (backupDir = 'backups') => {
    try {
        // Asegurar que existe el directorio de backups
        await fs.mkdir(backupDir, { recursive: true });

        // Obtener todos los datos
        const [users, clients, payments, fines] = await Promise.all([
            User.findAll(),
            Client.findAll(),
            Payment.findAll(),
            Fine.findAll()
        ]);

        const backupData = {
            timestamp: new Date().toISOString(),
            metadata: {
                totalUsers: users.length,
                totalClients: clients.length,
                totalPayments: payments.length,
                totalFines: fines.length
            },
            data: {
                users,
                clients,
                payments,
                fines
            }
        };

        // Crear nombre del archivo con timestamp
        const fileName = `backup-${backupData.timestamp.replace(/[:.]/g, '-')}.json`;
        const filePath = path.join(backupDir, fileName);

        // Guardar localmente
        await fs.writeFile(filePath, JSON.stringify(backupData, null, 2));

        // Subir a Supabase Storage
        const { data: uploadData, error: uploadError } = await auth.storage
            .from('backups')
            .upload(fileName, JSON.stringify(backupData, null, 2));

        if (uploadError) {
            throw new Error(`Error subiendo backup a Supabase: ${uploadError.message}`);
        }

        return {
            success: true,
            fileName,
            localPath: filePath,
            remotePath: uploadData.path,
            metadata: backupData.metadata,
            timestamp: backupData.timestamp
        };
    } catch (error) {
        console.error('Error creando backup:', error);
        throw new Error(`Error creando backup: ${error.message}`);
    }
};

/**
 * Restaura un backup de la base de datos
 * @param {string} backupFile - Nombre del archivo de backup a restaurar
 * @param {string} backupDir - Directorio donde se encuentran los backups
 * @returns {Promise<Object>} - Información de la restauración
 */
const restoreBackup = async (backupFile, backupDir = 'backups') => {
    try {
        let backupData;

        // Intentar obtener el backup de Supabase primero
        const { data: downloadData, error: downloadError } = await auth.storage
            .from('backups')
            .download(backupFile);

        if (!downloadError && downloadData) {
            backupData = JSON.parse(await downloadData.text());
        } else {
            // Si no está en Supabase, intentar leerlo localmente
            const filePath = path.join(backupDir, backupFile);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            backupData = JSON.parse(fileContent);
        }

        // Validar la estructura del backup
        if (!backupData || !backupData.data || !backupData.timestamp) {
            throw new Error('Formato de backup inválido');
        }

        // Eliminar datos existentes en orden inverso para evitar problemas de FK
        await auth.supabaseAdmin.from('multas').delete().neq('id', 0);
        await auth.supabaseAdmin.from('abonos').delete().neq('id', 0);
        await auth.supabaseAdmin.from('clientes').delete().neq('id', 0);
        await auth.supabaseAdmin.from('usuarios').delete().neq('id', 0);

        // Restaurar datos en orden correcto
        const restored = {
            users: 0,
            clients: 0,
            payments: 0,
            fines: 0
        };

        // Restaurar usuarios primero
        for (const user of backupData.data.users) {
            await User.create(user);
            restored.users++;
        }

        // Restaurar clientes
        for (const client of backupData.data.clients) {
            await Client.create(client);
            restored.clients++;
        }

        // Restaurar pagos
        for (const payment of backupData.data.payments) {
            await Payment.create(payment);
            restored.payments++;
        }

        // Restaurar multas
        for (const fine of backupData.data.fines) {
            await Fine.create(fine);
            restored.fines++;
        }

        return {
            success: true,
            timestamp: backupData.timestamp,
            restored,
            metadata: backupData.metadata
        };
    } catch (error) {
        console.error('Error restaurando backup:', error);
        throw new Error(`Error restaurando backup: ${error.message}`);
    }
};

/**
 * Lista todos los backups disponibles
 * @param {string} backupDir - Directorio donde se encuentran los backups
 * @returns {Promise<Object>} - Lista de backups locales y remotos
 */
const listBackups = async (backupDir = 'backups') => {
    try {
        // Obtener backups de Supabase
        const { data: remoteBackups, error: remoteError } = await auth.storage
            .from('backups')
            .list();

        if (remoteError) {
            throw new Error(`Error listando backups remotos: ${remoteError.message}`);
        }

        // Obtener backups locales
        let localBackups = [];
        try {
            const files = await fs.readdir(backupDir);
            localBackups = files.filter(file => file.endsWith('.json'));
        } catch (error) {
            console.warn('No se encontraron backups locales:', error.message);
        }

        return {
            remote: remoteBackups.map(backup => ({
                name: backup.name,
                size: backup.metadata.size,
                created: backup.metadata.lastModified
            })),
            local: localBackups
        };
    } catch (error) {
        console.error('Error listando backups:', error);
        throw new Error(`Error listando backups: ${error.message}`);
    }
};

/**
 * Elimina un backup específico
 * @param {string} backupFile - Nombre del archivo de backup a eliminar
 * @param {string} backupDir - Directorio donde se encuentran los backups
 * @param {Object} options - Opciones de eliminación
 * @returns {Promise<Object>} - Resultado de la eliminación
 */
const deleteBackup = async (backupFile, backupDir = 'backups', options = { local: true, remote: true }) => {
    try {
        const result = {
            local: false,
            remote: false
        };

        // Eliminar backup local si existe y está solicitado
        if (options.local) {
            try {
                const filePath = path.join(backupDir, backupFile);
                await fs.unlink(filePath);
                result.local = true;
            } catch (error) {
                console.warn('Error eliminando backup local:', error.message);
            }
        }

        // Eliminar backup remoto si está solicitado
        if (options.remote) {
            const { error: remoteError } = await auth.storage
                .from('backups')
                .remove([backupFile]);

            if (!remoteError) {
                result.remote = true;
            } else {
                console.warn('Error eliminando backup remoto:', remoteError.message);
            }
        }

        return {
            success: result.local || result.remote,
            deleted: result
        };
    } catch (error) {
        console.error('Error eliminando backup:', error);
        throw new Error(`Error eliminando backup: ${error.message}`);
    }
};

module.exports = {
    createBackup,
    restoreBackup,
    listBackups,
    deleteBackup
}; 