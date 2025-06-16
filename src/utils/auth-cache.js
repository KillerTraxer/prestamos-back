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