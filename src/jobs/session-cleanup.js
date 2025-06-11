const { auth } = require('../config/supabase');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');
const SessionManager = require('../utils/session-manager');

class SessionCleanupJob {
    /**
     * Ejecuta una limpieza de sesiones huérfanas y problemáticas
     * @returns {Promise<object>} Estadísticas de la limpieza
     */
    static async cleanupOrphanedSessions() {
        console.log('Iniciando limpieza de sesiones huérfanas...');
        
        const stats = {
            checked: 0,
            cleaned: 0,
            errors: 0,
            orphaned_auth: 0,
            orphaned_db: 0,
            start_time: new Date().toISOString()
        };

        try {
            // Obtener todos los usuarios de Auth
            const { data: authUsers, error: authError } = await auth.supabaseAdmin.auth.admin.listUsers();
            if (authError) throw authError;

            console.log(`Encontrados ${authUsers.users.length} usuarios en Supabase Auth`);

            // Obtener todos los usuarios de la BD
            const dbUsers = await User.findAll();
            const dbTrabajadores = await Trabajador.findAll();
            
            const allDbUsers = [...dbUsers, ...dbTrabajadores];
            const dbAuthIds = new Set(allDbUsers.map(u => u.auth_id).filter(Boolean));
            
            console.log(`Encontrados ${allDbUsers.length} usuarios en la base de datos`);

            // Encontrar usuarios en Auth que no están en BD (huérfanos en Auth)
            for (const authUser of authUsers.users) {
                stats.checked++;
                
                if (!dbAuthIds.has(authUser.id)) {
                    console.log(`Usuario huérfano en Auth encontrado: ${authUser.email} (${authUser.id})`);
                    stats.orphaned_auth++;
                    
                    // Limpiar sesiones del usuario huérfano
                    const success = await SessionManager.invalidateUserSessions(authUser.id, authUser.email);
                    if (success) {
                        stats.cleaned++;
                        console.log(`Sesiones limpiadas para usuario huérfano: ${authUser.email}`);
                    } else {
                        stats.errors++;
                        console.warn(`Error limpiando sesiones de usuario huérfano: ${authUser.email}`);
                    }
                }
            }

            // Encontrar usuarios en BD que no están en Auth (huérfanos en BD)
            const authUserIds = new Set(authUsers.users.map(u => u.id));
            
            for (const dbUser of allDbUsers) {
                if (dbUser.auth_id && !authUserIds.has(dbUser.auth_id)) {
                    console.log(`Usuario huérfano en BD encontrado: ${dbUser.email} (${dbUser.auth_id})`);
                    stats.orphaned_db++;
                    
                    // Este caso es menos común pero puede pasar si se eliminó el usuario de Auth
                    // pero no de la BD. Aquí podríamos marcar el usuario como inactivo o eliminarlo
                    console.warn(`Usuario ${dbUser.email} existe en BD pero no en Auth`);
                }
            }

            stats.end_time = new Date().toISOString();
            console.log('Limpieza de sesiones huérfanas completada:', stats);
            
            return stats;

        } catch (error) {
            console.error('Error durante limpieza de sesiones huérfanas:', error);
            stats.error = error.message;
            stats.end_time = new Date().toISOString();
            return stats;
        }
    }

    /**
     * Limpia sesiones de usuarios inactivos
     * @returns {Promise<object>} Estadísticas de la limpieza
     */
    static async cleanupInactiveSessions() {
        console.log('Iniciando limpieza de sesiones de usuarios inactivos...');
        
        const stats = {
            checked: 0,
            cleaned: 0,
            errors: 0,
            start_time: new Date().toISOString()
        };

        try {
            // Obtener usuarios inactivos de la BD
            const dbUsers = await User.findAll();
            const dbTrabajadores = await Trabajador.findAll();
            
            const allDbUsers = [...dbUsers, ...dbTrabajadores];
            const inactiveUsers = allDbUsers.filter(user => !user.isActive());
            
            console.log(`Encontrados ${inactiveUsers.length} usuarios inactivos`);

            for (const inactiveUser of inactiveUsers) {
                stats.checked++;
                
                if (inactiveUser.auth_id) {
                    const success = await SessionManager.invalidateUserSessions(
                        inactiveUser.auth_id, 
                        inactiveUser.email
                    );
                    
                    if (success) {
                        stats.cleaned++;
                        console.log(`Sesiones limpiadas para usuario inactivo: ${inactiveUser.email}`);
                    } else {
                        stats.errors++;
                        console.warn(`Error limpiando sesiones de usuario inactivo: ${inactiveUser.email}`);
                    }
                }
            }

            stats.end_time = new Date().toISOString();
            console.log('Limpieza de sesiones inactivas completada:', stats);
            
            return stats;

        } catch (error) {
            console.error('Error durante limpieza de sesiones inactivas:', error);
            stats.error = error.message;
            stats.end_time = new Date().toISOString();
            return stats;
        }
    }

    /**
     * Ejecuta una limpieza completa del sistema
     * @returns {Promise<object>} Estadísticas combinadas
     */
    static async fullCleanup() {
        console.log('Iniciando limpieza completa del sistema...');
        
        const orphanStats = await this.cleanupOrphanedSessions();
        const inactiveStats = await this.cleanupInactiveSessions();
        
        const combinedStats = {
            orphaned_cleanup: orphanStats,
            inactive_cleanup: inactiveStats,
            total_cleaned: orphanStats.cleaned + inactiveStats.cleaned,
            total_errors: orphanStats.errors + inactiveStats.errors,
            timestamp: new Date().toISOString()
        };
        
        console.log('Limpieza completa finalizada:', combinedStats);
        return combinedStats;
    }
}

module.exports = SessionCleanupJob; 