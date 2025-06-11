const { auth } = require('../config/supabase');

class SessionManager {
    /**
     * Invalida todas las sesiones de un usuario específico
     * @param {string} authId - ID de autenticación del usuario
     * @param {string} userEmail - Email del usuario (para logging)
     * @returns {Promise<boolean>} - true si fue exitoso, false si hubo error
     */
    static async invalidateUserSessions(authId, userEmail = 'unknown') {
        if (!authId) {
            console.warn('No se puede invalidar sesiones sin auth_id');
            return false;
        }

        // Validar que el authId tiene formato UUID válido
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(authId)) {
            console.warn(`auth_id inválido para invalidación: ${authId}`);
            return false;
        }

        try {
            console.log(`Invalidando sesiones para usuario: ${userEmail} (${authId})`);
            
            // Primero verificar que el usuario existe en Auth
            const { data: { user: authUser }, error: getUserError } = await auth.supabaseAdmin.auth.admin.getUserById(authId);
            if (getUserError) {
                console.warn(`Usuario no encontrado en Auth para invalidación: ${authId} - ${getUserError.message}`);
                return false;
            }

            if (!authUser) {
                console.warn(`Usuario no existe en Auth: ${authId}`);
                return false;
            }
            
            // Método 1: Intentar invalidación global usando el método correcto
            try {
                const { error: globalError } = await auth.supabaseAdmin.auth.admin.signOut(authId, 'global');
                if (!globalError) {
                    console.log(`Sesiones invalidadas exitosamente para: ${userEmail}`);
                    return true;
                }
                console.warn(`Error en invalidación global para ${userEmail}:`, {
                    message: globalError.message,
                    code: globalError.code
                });
            } catch (globalCatchError) {
                console.warn(`Error catch en invalidación global para ${userEmail}:`, globalCatchError.message);
            }

            // Método 2: Intentar invalidación de otras sesiones
            try {
                const { error: othersError } = await auth.supabaseAdmin.auth.admin.signOut(authId, 'others');
                if (!othersError) {
                    console.log(`Sesiones invalidadas con método 'others' para: ${userEmail}`);
                    return true;
                }
                console.warn(`Error en invalidación 'others' para ${userEmail}:`, {
                    message: othersError.message,
                    code: othersError.code
                });
            } catch (othersCatchError) {
                console.warn(`Error catch en invalidación 'others' para ${userEmail}:`, othersCatchError.message);
            }

            // Método 3: Como último recurso, eliminar completamente el usuario (solo si es seguro)
            console.log(`Métodos de invalidación fallaron para ${userEmail}, omitiendo eliminación por seguridad`);
            return false;

        } catch (error) {
            console.error(`Error general invalidando sesiones para ${userEmail}:`, error);
            return false;
        }
    }

    /**
     * Limpia una sesión problemática cuando hay discrepancia entre Auth y BD
     * @param {string} authId - ID de autenticación
     * @param {string} context - Contexto del error (para logging)
     * @returns {Promise<void>}
     */
    static async cleanupProblematicSession(authId, context = 'unknown') {
        if (!authId) return;

        try {
            console.log(`Limpiando sesión problemática [${context}] para auth_id: ${authId}`);
            
            // Solo intentar invalidar si el usuario existe en Auth
            const userExists = await this.userExistsInAuth(authId);
            if (!userExists) {
                console.log(`Usuario no existe en Auth, omitiendo invalidación de sesión para: ${authId}`);
                return;
            }
            
            const success = await this.invalidateUserSessions(authId, `problematic-${context}`);
            if (success) {
                console.log(`Sesión problemática limpiada exitosamente [${context}]`);
            } else {
                console.warn(`No se pudo limpiar completamente la sesión problemática [${context}]`);
            }
        } catch (error) {
            console.warn(`Error limpiando sesión problemática [${context}]:`, error);
        }
    }

    /**
     * Verifica si un usuario existe en Supabase Auth
     * @param {string} authId - ID de autenticación
     * @returns {Promise<boolean>}
     */
    static async userExistsInAuth(authId) {
        try {
            if (!authId) return false;
            
            // Validar formato UUID
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(authId)) {
                return false;
            }
            
            const { data: { user }, error } = await auth.supabaseAdmin.auth.admin.getUserById(authId);
            return !error && !!user;
        } catch (error) {
            console.warn(`Error verificando usuario en Auth: ${authId}`, error);
            return false;
        }
    }

    /**
     * Obtiene información de debug de una sesión
     * @param {string} authId - ID de autenticación
     * @returns {Promise<object>}
     */
    static async getSessionDebugInfo(authId) {
        try {
            const { data: { user }, error } = await auth.supabaseAdmin.auth.admin.getUserById(authId);
            if (error) {
                return {
                    exists: false,
                    error: error.message,
                    authId
                };
            }

            return {
                exists: true,
                user: {
                    id: user.id,
                    email: user.email,
                    created_at: user.created_at,
                    last_sign_in_at: user.last_sign_in_at,
                    email_confirmed_at: user.email_confirmed_at
                },
                authId
            };
        } catch (error) {
            return {
                exists: false,
                error: error.message,
                authId
            };
        }
    }

    /**
     * Método más suave para manejar problemas de sesión sin invalidar agresivamente
     * @param {string} authId - ID de autenticación
     * @param {string} context - Contexto del error
     * @returns {Promise<void>}
     */
    static async softCleanupSession(authId, context = 'unknown') {
        if (!authId) return;

        try {
            console.log(`Limpieza suave de sesión [${context}] para auth_id: ${authId}`);
            
            // Solo verificar que existe pero NO invalidar agresivamente
            const userExists = await this.userExistsInAuth(authId);
            if (userExists) {
                console.log(`Usuario existe en Auth, el problema puede ser temporal [${context}]`);
                // No hacer nada agresivo, dejar que el refresh token maneje la situación
            } else {
                console.log(`Usuario no existe en Auth [${context}]`);
            }
        } catch (error) {
            console.warn(`Error en limpieza suave [${context}]:`, error);
        }
    }
}

module.exports = SessionManager; 