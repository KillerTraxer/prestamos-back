const { supabaseAdmin } = require('../config/supabase');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const nodemailer = require('nodemailer');

// Configuración del transporter de email
const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Función para crear un backup
async function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '../backups');
    const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

    // Asegurarse de que el directorio de backups existe
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    try {
        // Obtener la URL de la base de datos desde Supabase
        const { data: { dbUrl }, error: dbUrlError } = await supabaseAdmin.rpc('get_db_url');
        
        if (dbUrlError) throw dbUrlError;

        // Crear el backup usando pg_dump
        const command = `pg_dump "${dbUrl}" > "${backupFile}"`;
        
        exec(command, async (error, stdout, stderr) => {
            if (error) {
                console.error(`Error ejecutando pg_dump: ${error}`);
                await sendBackupNotification('Error', `Error creando backup: ${error.message}`);
                return;
            }

            if (stderr) {
                console.error(`pg_dump stderr: ${stderr}`);
            }

            console.log(`Backup creado exitosamente: ${backupFile}`);
            
            // Enviar notificación de backup exitoso
            await sendBackupNotification(
                'Backup Exitoso',
                `Backup creado exitosamente: ${backupFile}\nTamaño: ${fs.statSync(backupFile).size} bytes`
            );

            // Limpiar backups antiguos (mantener solo los últimos 7 días)
            cleanupOldBackups();
        });
    } catch (error) {
        console.error('Error en el proceso de backup:', error);
        await sendBackupNotification('Error', `Error en el proceso de backup: ${error.message}`);
    }
}

// Función para limpiar backups antiguos
function cleanupOldBackups() {
    const backupDir = path.join(__dirname, '../backups');
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos

    fs.readdir(backupDir, (err, files) => {
        if (err) {
            console.error('Error leyendo directorio de backups:', err);
            return;
        }

        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(backupDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(`Error obteniendo stats de ${file}:`, err);
                    return;
                }

                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlink(filePath, err => {
                        if (err) {
                            console.error(`Error eliminando backup antiguo ${file}:`, err);
                        } else {
                            console.log(`Backup antiguo eliminado: ${file}`);
                        }
                    });
                }
            });
        });
    });
}

// Función para enviar notificaciones por email
async function sendBackupNotification(subject, message) {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: process.env.ADMIN_EMAIL,
            subject: `[Backup Supabase] ${subject}`,
            text: message
        });
        console.log('Notificación de backup enviada');
    } catch (error) {
        console.error('Error enviando notificación de backup:', error);
    }
}

// Función para restaurar un backup
async function restoreBackup(backupFile) {
    try {
        // Obtener la URL de la base de datos desde Supabase
        const { data: { dbUrl }, error: dbUrlError } = await supabaseAdmin.rpc('get_db_url');
        
        if (dbUrlError) throw dbUrlError;

        // Restaurar el backup usando psql
        const command = `psql "${dbUrl}" < "${backupFile}"`;
        
        exec(command, async (error, stdout, stderr) => {
            if (error) {
                console.error(`Error restaurando backup: ${error}`);
                await sendBackupNotification('Error', `Error restaurando backup: ${error.message}`);
                return;
            }

            if (stderr) {
                console.error(`psql stderr: ${stderr}`);
            }

            console.log(`Backup restaurado exitosamente desde: ${backupFile}`);
            await sendBackupNotification(
                'Restauración Exitosa',
                `Backup restaurado exitosamente desde: ${backupFile}`
            );
        });
    } catch (error) {
        console.error('Error en el proceso de restauración:', error);
        await sendBackupNotification('Error', `Error en el proceso de restauración: ${error.message}`);
    }
}

module.exports = {
    createBackup,
    restoreBackup
}; 