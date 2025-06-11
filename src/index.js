const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

// Importar rutas
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const workerRoutes = require('./routes/workers');
const statsRoutes = require('./routes/stats');
const backupRoutes = require('./routes/backup');
const loanRoutes = require('./routes/loans');
const fineRoutes = require('./routes/fines');
const adeudoRoutes = require('./routes/adeudos');
const movimientoRoutes = require('./routes/movimientos');
const expenseRoutes = require('./routes/expenses');

// Importar configuración de trabajos cron
const { initCronJobs } = require('./jobs/cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configurar almacenamiento de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Aceptar solo imágenes
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
            return cb(new Error('Solo se permiten archivos de imagen (jpg, jpeg, png)'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // límite de 5MB
    }
});

// Rutas
app.use('/auth', authRoutes);
app.use('/clientes', clientRoutes);
app.use('/trabajadores', workerRoutes);
app.use('/estadisticas', statsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/prestamos', loanRoutes);
app.use('/multas', fineRoutes);
app.use('/adeudos', adeudoRoutes);
app.use('/movimientos', movimientoRoutes);
app.use('/gastos', expenseRoutes);

// Health check routes
app.get('/', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Server is running' });
});

app.get('/ping', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Inicializar trabajos cron
initCronJobs();

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
}); 