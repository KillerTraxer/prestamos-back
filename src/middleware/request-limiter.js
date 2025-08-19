/**
 * Middleware para prevenir peticiones duplicadas y agrupadas
 *
 * Actualmente no aplica ninguna restricción y simplemente continúa con la petición.
 */
const requestLimiter = () => {
    return (req, res, next) => next();
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
 *
 * Desactivado: no impone ningún límite de peticiones.
 */
const earlyRateLimiter = (req, res, next) => next();

/**
 * Middleware para manejar peticiones simultáneas
 *
 * Desactivado: permite todas las peticiones sin restricciones.
 */
const concurrencyLimiter = (req, res, next) => next();

module.exports = {
    requestLimiter,
    requestLogger,
    concurrencyLimiter,
    earlyRateLimiter
};
