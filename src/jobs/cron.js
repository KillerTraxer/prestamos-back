const cron = require('node-cron');
const { createBackup } = require('../utils/backup');
const { sendEmailNotification } = require('../config/email');

// Backup diario a las 2 AM
const setupDailyBackup = () => {
    cron.schedule('0 2 * * *', async () => {
        console.log('Iniciando backup diario programado...');
        try {
            await createBackup();
            sendEmailNotification(
                'Backup Diario Completado',
                'El backup diario se ha completado exitosamente.'
            );
        } catch (error) {
            console.error('Error en backup diario programado:', error);
            sendEmailNotification(
                'Error en Backup Diario',
                `Error al realizar el backup diario: ${error.message}`
            );
        }
    }, {
        timezone: "America/Mexico_City"
    });
};

// Backup semanal los domingos a las 3 AM
const setupWeeklyBackup = () => {
    cron.schedule('0 3 * * 0', async () => {
        console.log('Iniciando backup semanal programado...');
        try {
            await createBackup();
            sendEmailNotification(
                'Backup Semanal Completado',
                'El backup semanal se ha completado exitosamente.'
            );
        } catch (error) {
            console.error('Error en backup semanal programado:', error);
            sendEmailNotification(
                'Error en Backup Semanal',
                `Error al realizar el backup semanal: ${error.message}`
            );
        }
    }, {
        timezone: "America/Mexico_City"
    });
};

const initCronJobs = () => {
    setupDailyBackup();
    setupWeeklyBackup();
    console.log('Trabajos cron inicializados');
};

module.exports = { initCronJobs }; 