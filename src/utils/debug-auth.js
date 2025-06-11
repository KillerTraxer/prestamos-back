const { auth } = require('../config/supabase');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');

class AuthDebugger {
    /**
     * Verifica si un usuario existe en Supabase Auth y en la BD
     * @param {string} authId - ID de autenticación
     * @returns {Promise<object>} - Información completa del diagnóstico
     */
    static async diagnoseUser(authId) {
        console.log(`\n=== DIAGNÓSTICO DE USUARIO: ${authId} ===`);
        
        const result = {
            authId,
            timestamp: new Date().toISOString(),
            supabaseAuth: null,
            database: {
                admin: null,
                trabajador: null
            },
            status: 'unknown',
            recommendations: []
        };

        try {
            // 1. Verificar en Supabase Auth
            console.log('1. Verificando en Supabase Auth...');
            const { data: authData, error: authError } = await auth.supabaseAdmin.auth.admin.getUserById(authId);
            
            if (authError) {
                console.log('❌ Error en Supabase Auth:', authError.message);
                result.supabaseAuth = { error: authError.message };
            } else if (authData.user) {
                console.log('✅ Usuario encontrado en Supabase Auth');
                result.supabaseAuth = {
                    exists: true,
                    email: authData.user.email,
                    created_at: authData.user.created_at,
                    last_sign_in_at: authData.user.last_sign_in_at,
                    email_confirmed_at: authData.user.email_confirmed_at
                };
            } else {
                console.log('❌ Usuario NO encontrado en Supabase Auth');
                result.supabaseAuth = { exists: false };
            }

            // 2. Verificar en tabla usuarios (admins)
            console.log('2. Verificando en tabla usuarios...');
            try {
                const adminUser = await User.findByAuthId(authId);
                if (adminUser) {
                    console.log('✅ Usuario encontrado en tabla usuarios (admin)');
                    result.database.admin = {
                        exists: true,
                        id: adminUser.id,
                        email: adminUser.email,
                        nombre: adminUser.nombre,
                        status: adminUser.status,
                        role: adminUser.role
                    };
                } else {
                    console.log('❌ Usuario NO encontrado en tabla usuarios');
                    result.database.admin = { exists: false };
                }
            } catch (error) {
                console.log('❌ Error buscando en tabla usuarios:', error.message);
                result.database.admin = { error: error.message };
            }

            // 3. Verificar en tabla trabajadores
            console.log('3. Verificando en tabla trabajadores...');
            try {
                const trabajador = await Trabajador.findByAuthId(authId);
                if (trabajador) {
                    console.log('✅ Usuario encontrado en tabla trabajadores');
                    result.database.trabajador = {
                        exists: true,
                        id: trabajador.id,
                        email: trabajador.email,
                        nombre: trabajador.nombre,
                        status: trabajador.status,
                        phone: trabajador.phone,
                        usuario_id: trabajador.usuario_id
                    };
                } else {
                    console.log('❌ Usuario NO encontrado en tabla trabajadores');
                    result.database.trabajador = { exists: false };
                }
            } catch (error) {
                console.log('❌ Error buscando en tabla trabajadores:', error.message);
                result.database.trabajador = { error: error.message };
            }

            // 4. Determinar status y recomendaciones
            const authExists = result.supabaseAuth?.exists === true;
            const adminExists = result.database.admin?.exists === true;
            const trabajadorExists = result.database.trabajador?.exists === true;

            if (authExists && (adminExists || trabajadorExists)) {
                result.status = 'healthy';
                console.log('✅ Estado: SALUDABLE - Usuario existe en Auth y BD');
            } else if (authExists && !adminExists && !trabajadorExists) {
                result.status = 'ghost_user';
                console.log('⚠️  Estado: USUARIO FANTASMA - Existe en Auth pero no en BD');
                result.recommendations.push('Considerar eliminar de Supabase Auth o crear entrada en BD');
            } else if (!authExists && (adminExists || trabajadorExists)) {
                result.status = 'orphaned_db';
                console.log('⚠️  Estado: BD HUÉRFANA - Existe en BD pero no en Auth');
                result.recommendations.push('Considerar eliminar de BD o recrear en Auth');
            } else {
                result.status = 'not_found';
                console.log('❌ Estado: NO ENCONTRADO - No existe en ningún lado');
            }

            // 5. Verificar coherencia de emails
            if (authExists && (adminExists || trabajadorExists)) {
                const authEmail = result.supabaseAuth.email;
                const dbEmail = adminExists ? result.database.admin.email : result.database.trabajador.email;
                
                if (authEmail !== dbEmail) {
                    console.log('⚠️  ADVERTENCIA: Emails no coinciden');
                    console.log(`   Auth: ${authEmail}`);
                    console.log(`   BD: ${dbEmail}`);
                    result.recommendations.push('Emails no coinciden entre Auth y BD');
                }
            }

        } catch (error) {
            console.error('❌ Error durante diagnóstico:', error);
            result.error = error.message;
        }

        console.log('=== FIN DIAGNÓSTICO ===\n');
        return result;
    }

    /**
     * Busca usuarios problemáticos comparando Auth vs BD
     * @returns {Promise<object>} - Lista de usuarios con problemas
     */
    static async findProblematicUsers() {
        console.log('\n=== BÚSQUEDA DE USUARIOS PROBLEMÁTICOS ===');
        
        try {
            // Obtener todos los usuarios de BD
            const { data: adminsData, error: adminsError } = await auth.supabaseAdmin
                .from('usuarios')
                .select('auth_id, email, nombre');
                
            if (adminsError) throw adminsError;

            const { data: trabajadoresData, error: trabajadoresError } = await auth.supabaseAdmin
                .from('trabajadores')
                .select('auth_id, email, nombre');
                
            if (trabajadoresError) throw trabajadoresError;

            const allDbUsers = [
                ...adminsData.map(u => ({ ...u, type: 'admin' })),
                ...trabajadoresData.map(u => ({ ...u, type: 'trabajador' }))
            ];

            console.log(`Verificando ${allDbUsers.length} usuarios de BD...`);

            const problematic = [];

            for (const dbUser of allDbUsers) {
                if (!dbUser.auth_id) {
                    problematic.push({
                        ...dbUser,
                        issue: 'missing_auth_id',
                        description: 'Usuario en BD sin auth_id'
                    });
                    continue;
                }

                // Verificar si existe en Auth
                const { data: authData, error: authError } = await auth.supabaseAdmin.auth.admin.getUserById(dbUser.auth_id);
                
                if (authError || !authData.user) {
                    problematic.push({
                        ...dbUser,
                        issue: 'auth_not_found',
                        description: 'Usuario en BD pero no en Supabase Auth'
                    });
                }
            }

            console.log(`Encontrados ${problematic.length} usuarios problemáticos`);
            return {
                total_checked: allDbUsers.length,
                problematic_count: problematic.length,
                problematic_users: problematic
            };

        } catch (error) {
            console.error('Error buscando usuarios problemáticos:', error);
            throw error;
        }
    }

    /**
     * Ejecuta un diagnóstico rápido del problema específico del refresh token
     * @param {string} authId - ID de autenticación que está fallando
     */
    static async quickRefreshDiagnosis(authId) {
        console.log(`\n=== DIAGNÓSTICO REFRESH TOKEN: ${authId} ===`);
        
        try {
            // Verificar usuario en Auth
            const { data: { user }, error: getUserError } = await auth.supabaseAdmin.auth.admin.getUserById(authId);
            
            if (getUserError) {
                console.log('❌ Error obteniendo usuario:', getUserError.message);
                return { success: false, error: 'user_not_found_in_auth' };
            }

            console.log('✅ Usuario encontrado en Auth');

            // Búsqueda inmediata en BD
            console.log('Búsqueda inmediata en BD...');
            const adminUser = await User.findByAuthId(authId);
            const trabajadorUser = !adminUser ? await Trabajador.findByAuthId(authId) : null;
            const dbUser = adminUser || trabajadorUser;
            
            if (!dbUser) {
                console.log('❌ Usuario NO encontrado en BD');
                
                // Retry con delay
                console.log('Reintentando con delay...');
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const retryAdmin = await User.findByAuthId(authId);
                const retryTrabajador = !retryAdmin ? await Trabajador.findByAuthId(authId) : null;
                const retryUser = retryAdmin || retryTrabajador;
                
                if (retryUser) {
                    console.log('✅ Usuario encontrado en segundo intento - PROBLEMA DE TIMING');
                    return { success: true, issue: 'timing_issue' };
                } else {
                    console.log('❌ Usuario sigue sin encontrarse - PROBLEMA DE DATOS');
                    return { success: false, issue: 'data_inconsistency' };
                }
            } else {
                console.log('✅ Usuario encontrado en BD correctamente');
                return { success: true, user_type: adminUser ? 'admin' : 'trabajador' };
            }

        } catch (error) {
            console.error('Error en diagnóstico:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = AuthDebugger; 