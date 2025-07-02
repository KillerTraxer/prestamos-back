const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const authCache = require('../utils/auth-cache');

// Ruta para obtener estadísticas del cache (solo para admins)
router.get('/stats', authenticateJWT, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Solo los administradores pueden ver estadísticas del cache'
        });
    }

    try {
        const cacheStats = authCache.getCacheStats();
        
        res.json({
            message: 'Estadísticas del cache obtenidas exitosamente',
            cache_stats: cacheStats,
            performance_info: {
                memory_usage: process.memoryUsage(),
                uptime: process.uptime(),
                node_version: process.version
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas del cache:', error);
        res.status(500).json({
            error: 'Error interno',
            message: 'No se pudieron obtener las estadísticas del cache'
        });
    }
});

// Ruta para limpiar el cache (solo para admins)
router.post('/clear', authenticateJWT, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Solo los administradores pueden limpiar el cache'
        });
    }

    try {
        const { type } = req.body;
        
        if (type === 'all') {
            authCache.clearAll();
            console.log('Cache completo limpiado por admin:', req.user.email);
        } else if (type === 'user' && req.body.auth_id) {
            authCache.clearUserCache(req.body.auth_id);
            console.log('Cache de usuario limpiado:', req.body.auth_id);
        } else {
            return res.status(400).json({
                error: 'Parámetros inválidos',
                message: 'Especifique type: "all" o "user" con auth_id'
            });
        }

        res.json({
            message: 'Cache limpiado exitosamente',
            type: type,
            cleared_by: req.user.email,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error limpiando cache:', error);
        res.status(500).json({
            error: 'Error interno',
            message: 'No se pudo limpiar el cache'
        });
    }
});

// Ruta para obtener información de rendimiento
router.get('/performance', authenticateJWT, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Solo los administradores pueden ver información de rendimiento'
        });
    }

    try {
        const memUsage = process.memoryUsage();
        const cacheStats = authCache.getCacheStats();
        
        // Calcular hit rate aproximado
        const totalRequests = Object.values(cacheStats).reduce((acc, cache) => {
            return acc + (cache.stats?.gets || 0);
        }, 0);
        
        const totalHits = Object.values(cacheStats).reduce((acc, cache) => {
            return acc + (cache.stats?.hits || 0);
        }, 0);
        
        const hitRate = totalRequests > 0 ? (totalHits / totalRequests * 100).toFixed(2) : 0;

        res.json({
            message: 'Información de rendimiento obtenida exitosamente',
            performance: {
                memory: {
                    used_mb: Math.round(memUsage.used / 1024 / 1024),
                    total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
                    external_mb: Math.round(memUsage.external / 1024 / 1024)
                },
                cache: {
                    hit_rate_percent: hitRate,
                    total_requests: totalRequests,
                    total_hits: totalHits,
                    active_keys: Object.values(cacheStats).reduce((acc, cache) => acc + cache.keys, 0)
                },
                server: {
                    uptime_hours: (process.uptime() / 3600).toFixed(2),
                    node_version: process.version,
                    platform: process.platform
                }
            },
            recommendations: generatePerformanceRecommendations(cacheStats, memUsage),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error obteniendo información de rendimiento:', error);
        res.status(500).json({
            error: 'Error interno',
            message: 'No se pudo obtener la información de rendimiento'
        });
    }
});

function generatePerformanceRecommendations(cacheStats, memUsage) {
    const recommendations = [];
    
    // Revisar uso de memoria
    const memUsageMB = memUsage.used / 1024 / 1024;
    if (memUsageMB > 500) {
        recommendations.push({
            type: 'memory',
            level: 'warning',
            message: 'Alto uso de memoria detectado. Considere reiniciar el servidor.'
        });
    }
    
    // Revisar hit rate del cache
    const totalRequests = Object.values(cacheStats).reduce((acc, cache) => acc + (cache.stats?.gets || 0), 0);
    const totalHits = Object.values(cacheStats).reduce((acc, cache) => acc + (cache.stats?.hits || 0), 0);
    const hitRate = totalRequests > 0 ? (totalHits / totalRequests * 100) : 0;
    
    if (hitRate < 30 && totalRequests > 100) {
        recommendations.push({
            type: 'cache',
            level: 'warning',
            message: 'Baja tasa de aciertos en cache. Revise la configuración de TTL.'
        });
    }
    
    // Revisar número de keys en cache
    const totalKeys = Object.values(cacheStats).reduce((acc, cache) => acc + cache.keys, 0);
    if (totalKeys > 1000) {
        recommendations.push({
            type: 'cache',
            level: 'info',
            message: 'Muchas entradas en cache. Considere limpiar entradas antiguas.'
        });
    }
    
    if (recommendations.length === 0) {
        recommendations.push({
            type: 'performance',
            level: 'success',
            message: 'El rendimiento del servidor está dentro de los parámetros normales.'
        });
    }
    
    return recommendations;
}

// Limpiar todo el cache (solo admin)
router.post('/clear-all', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin puede limpiar cache' });
    }

    try {
        authCache.clearAll();
        console.log('🧹 Todo el cache limpiado por admin:', req.user.id);
        res.json({ 
            message: 'Cache limpiado exitosamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error limpiando cache:', error);
        res.status(500).json({ error: 'Error limpiando cache' });
    }
});

// Limpiar cache específico de un trabajador (solo admin)
router.post('/clear-worker/:workerId', authenticateJWT, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin puede limpiar cache' });
    }

    const { workerId } = req.params;

    try {
        authCache.invalidateAllDataCache(workerId);
        console.log('🧹 Cache limpiado para trabajador:', workerId);
        res.json({ 
            message: `Cache limpiado para trabajador ${workerId}`,
            workerId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error limpiando cache del trabajador:', error);
        res.status(500).json({ error: 'Error limpiando cache del trabajador' });
    }
});

module.exports = router; 