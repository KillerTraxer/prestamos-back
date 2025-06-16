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

        // Para peticiones de estadísticas, ser extremadamente permisivo (operación compleja)
        if (req.path.includes('/stats') || req.path.includes('/updated-stats') || req.path.includes('/estadisticas/')) {
            if (!authCache.checkRateLimit(`stats:${requestKey}`, 30)) { // máximo 30 por minuto
                console.log(`Stats request rate limited: ${requestKey} from IP: ${clientIP}`);
                return res.status(429).json({
                    error: 'Stats rate limit',
                    message: 'Demasiadas peticiones de estadísticas. Espere un momento.',
                    retryAfter: 5
                });
            }
        }

        next();
    };
};

/**
 * Middleware para logging de peticiones repetitivas (solo para debug)
 * Se ejecuta DESPUÉS del middleware de autenticación
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
 * Middleware de rate limiting temprano (antes de autenticación)
 */
const earlyRateLimiter = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Rate limiting muy permisivo para estadísticas (operación compleja)
    if (req.path.includes('/auth/profile/updated-stats') || req.path.includes('/estadisticas/')) {
        if (!authCache.checkRateLimit(`early:${clientIP}:stats`, 50)) { // máximo 50 por minuto
            console.log(`🚫 Early rate limit exceeded for stats: IP ${clientIP}`);
            return res.status(429).json({
                error: 'Too many requests',
                message: 'Demasiadas peticiones a estadísticas. Espere un momento.',
                retryAfter: 10
            });
        }
    }
    
    // Rate limiting general por IP - muy permisivo
    if (!authCache.checkRateLimit(`early:${clientIP}`, 100)) { // máximo 100 por minuto
        console.log(`🚫 Early rate limit exceeded: IP ${clientIP}`);
        return res.status(429).json({
            error: 'Too many requests',
            message: 'Demasiadas peticiones. Espere un momento.',
            retryAfter: 20
        });
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
    concurrencyLimiter,
    earlyRateLimiter
}; 