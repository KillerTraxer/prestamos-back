const NodeCache = require('node-cache');

class AuthCache {
    constructor() {
        // Cache con TTL de 5 minutos para datos de usuario
        this.userCache = new NodeCache({ 
            stdTTL: 300, // 5 minutos
            checkperiod: 60, // verificar cada minuto
            useClones: false 
        });
        
        // Cache con TTL de 2 minutos para verificación de tokens
        this.tokenCache = new NodeCache({ 
            stdTTL: 120, // 2 minutos
            checkperiod: 30,
            useClones: false 
        });
        
        // Cache con TTL de 1 minuto para estadísticas
        this.statsCache = new NodeCache({ 
            stdTTL: 60, // 1 minuto
            checkperiod: 15,
            useClones: false 
        });
        
        // Cache con TTL de 5 minutos para gráficas complejas
        this.chartCache = new NodeCache({ 
            stdTTL: 300, // 5 minutos
            checkperiod: 30,
            useClones: false 
        });

        // Rate limiter simple
        this.requestCounts = new NodeCache({ 
            stdTTL: 60, // 1 minuto
            checkperiod: 10 
        });
    }

    // Cache para datos de usuario por auth_id
    getUserData(authId) {
        return this.userCache.get(`user:${authId}`);
    }

    setUserData(authId, userData) {
        return this.userCache.set(`user:${authId}`, userData);
    }

    // Cache para verificación de tokens
    getTokenVerification(token) {
        // Usar solo los últimos 8 caracteres del token para el cache key
        const tokenKey = token.slice(-8);
        return this.tokenCache.get(`token:${tokenKey}`);
    }

    setTokenVerification(token, verificationResult) {
        const tokenKey = token.slice(-8);
        return this.tokenCache.set(`token:${tokenKey}`, verificationResult);
    }

    // Cache para estadísticas de usuario
    getUserStats(userId, role) {
        return this.statsCache.get(`stats:${userId}:${role}`);
    }

    setUserStats(userId, role, stats) {
        return this.statsCache.set(`stats:${userId}:${role}`, stats);
    }

    // Cache para gráficas complejas
    getChartData(userId, role, chartType, period) {
        const key = `chart:${userId}:${role}:${chartType}:${period}`;
        return this.chartCache.get(key);
    }

    setChartData(userId, role, chartType, period, data) {
        const key = `chart:${userId}:${role}:${chartType}:${period}`;
        return this.chartCache.set(key, data);
    }

    // Rate limiting simple
    checkRateLimit(identifier, maxRequests = 10) {
        const current = this.requestCounts.get(identifier) || 0;
        if (current >= maxRequests) {
            return false; // Rate limit exceeded
        }
        this.requestCounts.set(identifier, current + 1);
        return true;
    }

    // Rate limiting inteligente con escalamiento progresivo
    checkSmartRateLimit(identifier, baseLimit, userRole = 'trabajador') {
        const current = this.requestCounts.get(identifier) || 0;
        
        // Límites más generosos para admins
        const roleMultiplier = userRole === 'admin' ? 1.5 : 1;
        const effectiveLimit = Math.floor(baseLimit * roleMultiplier);
        
        if (current >= effectiveLimit) {
            return {
                allowed: false,
                current,
                limit: effectiveLimit,
                retryAfter: this.calculateRetryTime(current, effectiveLimit)
            };
        }
        
        this.requestCounts.set(identifier, current + 1);
        return {
            allowed: true,
            current: current + 1,
            limit: effectiveLimit,
            retryAfter: 0
        };
    }

    // Calcular tiempo de retry basado en qué tan por encima del límite está
    calculateRetryTime(current, limit) {
        const overage = current - limit;
        if (overage <= 5) return 2; // Pequeño exceso = 2 segundos
        if (overage <= 15) return 3; // Exceso medio = 3 segundos
        return 5; // Exceso grande = 5 segundos máximo
    }

    // Limpiar cache de un usuario específico
    clearUserCache(authId) {
        this.userCache.del(`user:${authId}`);
        // También limpiar stats si las hay
        const keys = this.statsCache.keys();
        keys.forEach(key => {
            if (key.includes(authId)) {
                this.statsCache.del(key);
            }
        });
        // También limpiar gráficas
        const chartKeys = this.chartCache.keys();
        chartKeys.forEach(key => {
            if (key.includes(authId)) {
                this.chartCache.del(key);
            }
        });
    }

    // Invalidar cache específico de clientes para un trabajador
    invalidateClientsCache(trabajadorId) {
        const cacheKey = `clients:${trabajadorId}`;
        const adminCacheKey = `clients_by_collector:${trabajadorId}`;
        
        // Limpiar claves específicas
        this.chartCache.del(`chart:${trabajadorId}:trabajador:clients_list:${cacheKey}`);
        this.chartCache.del(`chart:${trabajadorId}:admin:clients_list:${adminCacheKey}`);
        
        // Limpiar cualquier cache que incluya este trabajador y clientes
        const allKeys = this.chartCache.keys();
        allKeys.forEach(key => {
            if (key.includes('clients_list') && key.includes(trabajadorId)) {
                this.chartCache.del(key);
            }
        });
        
        console.log('💾 Cache de clientes invalidado para trabajador:', trabajadorId);
    }

    // Invalidar cache específico de préstamos para un trabajador
    invalidateLoansCache(trabajadorId) {
        const cacheKey = `loans:${trabajadorId}`;
        const adminCacheKey = `loans_by_collector:${trabajadorId}`;
        
        // Limpiar claves específicas
        this.chartCache.del(`chart:${trabajadorId}:trabajador:loans_list:${cacheKey}`);
        this.chartCache.del(`chart:${trabajadorId}:admin:loans_list:${adminCacheKey}`);
        
        // Limpiar cualquier cache que incluya este trabajador y préstamos
        const allKeys = this.chartCache.keys();
        allKeys.forEach(key => {
            if (key.includes('loans_list') && key.includes(trabajadorId)) {
                this.chartCache.del(key);
            }
        });
        
        console.log('💾 Cache de préstamos invalidado para trabajador:', trabajadorId);
    }

    // Invalidar cache específico de trabajadores para un admin
    invalidateWorkersCache(adminId) {
        // Limpiar cache de lista de trabajadores
        this.chartCache.del(`chart:${adminId}:admin:workers_list:all`);
        
        // Limpiar cache de recolecciones diarias y mensuales
        this.chartCache.del(`chart:${adminId}:admin:daily_collections:today`);
        this.chartCache.del(`chart:${adminId}:admin:monthly_collections:this_month`);
        
        // Limpiar cualquier cache que incluya workers para este admin
        const allKeys = this.chartCache.keys();
        allKeys.forEach(key => {
            if ((key.includes('workers_list') || key.includes('daily_collections') || key.includes('monthly_collections')) && key.includes(adminId)) {
                this.chartCache.del(key);
            }
        });
        
        console.log('💾 Cache de trabajadores invalidado para admin:', adminId);
    }

    // Invalidar todo el cache relacionado con un trabajador después de eliminar cliente
    invalidateAllDataCache(trabajadorId) {
        // Invalidar clientes
        this.invalidateClientsCache(trabajadorId);
        
        // Invalidar préstamos
        this.invalidateLoansCache(trabajadorId);
        
        // Invalidar estadísticas
        this.statsCache.del(`stats:${trabajadorId}:trabajador`);
        
        // Limpiar todo el cache de gráficas para este trabajador
        const allKeys = this.chartCache.keys();
        allKeys.forEach(key => {
            if (key.includes(`:${trabajadorId}:`)) {
                this.chartCache.del(key);
            }
        });
        
        // Si hay un admin viendo estos datos, también limpiar su cache
        const adminKeys = this.chartCache.keys();
        adminKeys.forEach(key => {
            if (key.includes('admin') && key.includes(trabajadorId)) {
                this.chartCache.del(key);
            }
        });
        
        console.log('💾 Todo el cache invalidado para trabajador:', trabajadorId);
    }

    // Limpiar todo el cache
    clearAll() {
        this.userCache.flushAll();
        this.tokenCache.flushAll();
        this.statsCache.flushAll();
        this.chartCache.flushAll();
        this.requestCounts.flushAll();
    }

    // Obtener estadísticas del cache
    getCacheStats() {
        return {
            users: {
                keys: this.userCache.keys().length,
                stats: this.userCache.getStats()
            },
            tokens: {
                keys: this.tokenCache.keys().length,
                stats: this.tokenCache.getStats()
            },
            stats: {
                keys: this.statsCache.keys().length,
                stats: this.statsCache.getStats()
            },
            charts: {
                keys: this.chartCache.keys().length,
                stats: this.chartCache.getStats()
            },
            rateLimits: {
                keys: this.requestCounts.keys().length,
                stats: this.requestCounts.getStats()
            }
        };
    }
}

// Instancia singleton
const authCache = new AuthCache();

module.exports = authCache; 