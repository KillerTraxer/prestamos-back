const authCache = require('../utils/auth-cache');

/**
 * Middleware para prevenir peticiones duplicadas y agrupadas
 */
const requestLimiter = (options = {}) => {
    const {
        windowMs = 1000, // 1 segundo
        maxDuplicates = 3, // máximo 3 peticiones idénticas en la ventana de tiempo
        skipSuccessfulGET = true // skip rate limit for successful GET requests
    } = options;

    return (req, res, next) => {
        // Crear una key única para la petición basada en método, URL y usuario
        const userId = req.user?.id || 'anonymous';
        const requestKey = `${req.method}:${req.path}:${userId}`;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Para peticiones de autenticación, usar rate limiting más estricto
        if (req.path.includes('/auth') && req.method === 'GET') {
            if (!authCache.checkRateLimit(`duplicate:${requestKey}`, maxDuplicates)) {
                console.log(`Duplicate request blocked: ${requestKey} from IP: ${clientIP}`);
                return res.status(429).json({
                    error: 'Duplicate request',
                    message: 'Petición duplicada detectada. Evite hacer múltiples peticiones simultáneas.',
                    retryAfter: Math.ceil(windowMs / 1000)
                });
            }
        }

        // Para peticiones de estadísticas, ser más restrictivo
        if (req.path.includes('/stats') || req.path.includes('/updated-stats')) {
            if (!authCache.checkRateLimit(`stats:${requestKey}`, 2)) { // máximo 2 por minuto
                console.log(`Stats request rate limited: ${requestKey} from IP: ${clientIP}`);
                return res.status(429).json({
                    error: 'Stats rate limit',
                    message: 'Demasiadas peticiones de estadísticas. Espere un momento.',
                    retryAfter: 30
                });
            }
        }

        next();
    };
};

/**
 * Middleware para logging de peticiones repetitivas (solo para debug)
 */
const requestLogger = (req, res, next) => {
    const userId = req.user?.id || 'anonymous';
    const userEmail = req.user?.email || 'unknown';
    const requestKey = `${req.method}:${req.path}`;
    
    // Solo loggear peticiones problemáticas
    if (req.path.includes('/auth') || req.path.includes('/stats')) {
        console.log(`🔍 Request: ${requestKey} | User: ${userEmail} (${userId}) | IP: ${req.ip || 'unknown'}`);
    }
    
    next();
};

/**
 * Middleware para manejar peticiones simultáneas
 */
const concurrencyLimiter = (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return next();

    const concurrentKey = `concurrent:${userId}`;
    const currentCount = authCache.requestCounts.get(concurrentKey) || 0;
    
    // Máximo 5 peticiones simultáneas por usuario
    if (currentCount >= 5) {
        console.log(`Concurrency limit exceeded for user: ${userId}`);
        return res.status(429).json({
            error: 'Too many concurrent requests',
            message: 'Demasiadas peticiones simultáneas. Espere a que terminen las anteriores.',
            retryAfter: 2
        });
    }

    // Incrementar contador
    authCache.requestCounts.set(concurrentKey, currentCount + 1, 10); // TTL de 10 segundos
    
    // Decrementar al terminar la petición
    res.on('finish', () => {
        const newCount = authCache.requestCounts.get(concurrentKey) || 0;
        if (newCount > 0) {
            authCache.requestCounts.set(concurrentKey, newCount - 1, 10);
        }
    });

    next();
};

module.exports = {
    requestLimiter,
    requestLogger,
    concurrencyLimiter
}; 