const express = require('express');
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.json());

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'prestamos'
});

db.connect(err => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        throw err;
    }
    console.log('Conectado a la base de datos');
});

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];

        jwt.verify(token, 'your_jwt_secret', (err, user) => {
            if (err) {
                console.error('Error verificando JWT:', err);
                return res.sendStatus(403);
            }
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM usuarios WHERE email = ? AND password = ?', [email, password], (err, result) => {
        if (err) {
            console.error('Error en la consulta de login:', err);
            throw err;
        }

        if (result.length > 0) {
            const user = result[0];
            console.log('Usuario autenticado:', user); // Agregar esta línea

            const token = jwt.sign({ id: user.id, role: user.role }, 'your_jwt_secret', { expiresIn: '1d' });
            console.log('Token generado:', token); // Agregar esta línea
            res.json({ token });
        } else {
            console.log('Credenciales incorrectas para:', email);
            res.status(401).json({ message: 'Credenciales incorrectas' });
        }
    });
});




app.get('/clientes', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const query = `
        SELECT c.*, COUNT(m.id) AS total_multas 
        FROM clientes c 
        LEFT JOIN multas m ON c.id = m.cliente_id 
        WHERE c.trabajador_id = ? 
        GROUP BY c.id`;

    db.query(query, [req.user.id], (err, result) => {
        if (err) {
            console.error('Error obteniendo clientes:', err);
            throw err;
        }
        res.json(result);
    });
});

const calcularInteresTotal = (montoInicial, tasaInteres) => {
    return montoInicial * tasaInteres;
};

const calcularTotalAPagar = (montoInicial, interesTotal) => {
    return montoInicial + interesTotal;
};

const calcularPagosDiarios = (totalAPagar, dias) => {
    return totalAPagar / dias;
};



app.post('/clientes', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const { nombre, ocupacion, direccion, telefono, fecha_termino, monto_inicial } = req.body;
    if (!nombre || !ocupacion || !direccion || !telefono || !fecha_termino || !monto_inicial) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const trabajador_id = req.user.id;
    const fecha_inicio = new Date();
    fecha_inicio.setDate(fecha_inicio.getDate() + 1); // Establece la fecha de inicio para el día siguiente
    fecha_inicio.setHours(0, 0, 0, 0); // Opcional: Establecer hora a 00:00 para la fecha exacta
    const fechaTerminoSeleccionada = new Date(fecha_termino);
    const dias = Math.ceil((fechaTerminoSeleccionada - fecha_inicio) / (1000 * 60 * 60 * 24));
    const tasaInteres = 0.30;

    const interesTotal = calcularInteresTotal(parseFloat(monto_inicial), tasaInteres);
    const totalAPagar = calcularTotalAPagar(parseFloat(monto_inicial), interesTotal);
    const pagosDiarios = calcularPagosDiarios(totalAPagar, dias);

    db.query(
        'INSERT INTO clientes (nombre, ocupacion, direccion, telefono, fecha_inicio, fecha_termino, multas, monto_inicial, monto_actual, estado, trabajador_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [nombre, ocupacion, direccion, telefono, fecha_inicio.toISOString().split('T')[0], fechaTerminoSeleccionada.toISOString().split('T')[0], '0', monto_inicial, totalAPagar, 'pendiente', trabajador_id],
        (err, result) => {
            if (err) {
                console.error('Error creando cliente:', err);
                return res.status(500).json({ error: 'Error creando cliente' });
            }
            res.status(201).json({ message: 'Cliente creado', id: result.insertId, pagos_diarios: pagosDiarios });
        }
    );
});


app.get('/clientes/:id', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    const query = `
        SELECT c.*, COUNT(m.id) AS total_multas
        FROM clientes c 
        LEFT JOIN multas m ON c.id = m.cliente_id 
        WHERE c.id = ? 
        GROUP BY c.id`;

    db.query(query, [clienteId], (err, result) => {
        if (err) {
            console.error('Error obteniendo cliente:', err);
            return res.status(500).json({ error: 'Error obteniendo cliente' });
        }

        if (result.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json(result[0]);
    });
});

app.put('/clientes/:id', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;
    const { nombre, ocupacion, direccion, telefono, fecha_inicio, fecha_termino, monto_inicial, monto_actual, estado } = req.body;

    // Si el monto_actual es 0 pero no es por un pago completo, mantener el estado en "pendiente"
    let nuevoEstado = estado;
    if (monto_actual === 0 && estado !== 'completado') {
        nuevoEstado = 'pendiente';
    }

    const query = `
        UPDATE clientes 
        SET nombre = ?, ocupacion = ?, direccion = ?, telefono = ?, fecha_inicio = ?, fecha_termino = ?, monto_inicial = ?, monto_actual = ?, estado = ? 
        WHERE id = ?`;

    db.query(query, [nombre, ocupacion, direccion, telefono, fecha_inicio, fecha_termino, monto_inicial, monto_actual, nuevoEstado, clienteId], (err, result) => {
        if (err) {
            console.error('Error actualizando cliente:', err);
            return res.status(500).json({ error: 'Error actualizando cliente' });
        }

        res.json({ message: 'Cliente actualizado correctamente' });
    });
});
app.delete('/clientes/:id', authenticateJWT, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    db.query('DELETE FROM clientes WHERE id = ?', [clienteId], (err, result) => {
        if (err) {
            console.error('Error eliminando cliente:', err);
            return res.status(500).json({ error: 'Error eliminando cliente' });
        }

        res.json({ message: 'Cliente eliminado correctamente' });
    });
});



app.get('/clientes/:id/multas', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    db.query('SELECT id, fecha, monto, estado FROM multas WHERE cliente_id = ?', [clienteId], (err, result) => {
        if (err) {
            console.error('Error obteniendo multas:', err);
            return res.status(500).json({ error: 'Error obteniendo multas' });
        }

        res.json(result);
    });
});
app.post('/clientes/:id/multas', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') {
        return res.sendStatus(403);
    }

    const clienteId = req.params.id;
    const { fecha } = req.body;

    if (!fecha) {
        return res.status(400).json({ error: 'Fecha es un campo requerido' });
    }

    const montoMultaFija = 20; // Multa fija de 20 pesos

    db.query('SELECT monto_inicial, monto_actual, fecha_termino FROM clientes WHERE id = ?', [clienteId], (err, result) => {
        if (err) {
            console.error('Error obteniendo datos del cliente:', err);
            return res.status(500).json({ error: 'Error obteniendo datos del cliente' });
        }

        if (result.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const cliente = result[0];
        const montoMulta = montoMultaFija;

        db.query(
            'INSERT INTO multas (cliente_id, fecha, monto, estado) VALUES (?, ?, ?, ?)',
            [clienteId, fecha, montoMulta, 'pendiente'],
            (err) => {
                if (err) {
                    console.error('Error creando multa:', err);
                    return res.status(500).json({ error: 'Error creando multa' });
                }

                // Contar las multas diarias y semanales
                const queryMultas = `
                    SELECT 
                        IFNULL(SUM(CASE WHEN DATE(fecha) = CURDATE() THEN 1 ELSE 0 END), 0) AS total_multas_hoy,
                        IFNULL(SUM(CASE WHEN YEARWEEK(fecha, 1) = YEARWEEK(CURDATE(), 1) THEN 1 ELSE 0 END), 0) AS total_multas_semanales
                    FROM multas
                    WHERE cliente_id = ?
                `;

                db.query(queryMultas, [clienteId], (err, result) => {
                    if (err) {
                        console.error('Error contando multas:', err);
                        return res.status(500).json({ error: 'Error contando multas' });
                    }

                    const totalMultasHoy = result[0].total_multas_hoy;
                    const totalMultasSemanales = result[0].total_multas_semanales;

                    const nuevoMonto = parseFloat(cliente.monto_actual) + montoMulta;
                    const nuevaFechaTermino = new Date(cliente.fecha_termino);

                    if (totalMultasHoy % 3 === 0) {
                        nuevaFechaTermino.setDate(nuevaFechaTermino.getDate() + 1);
                    }

                    db.query(
                        'UPDATE clientes SET monto_actual = ?, fecha_termino = ?, total_multas_hoy = ?, total_multas_semanales = ? WHERE id = ?',
                        [nuevoMonto, nuevaFechaTermino, totalMultasHoy, totalMultasSemanales, clienteId],
                        (err) => {
                            if (err) {
                                console.error('Error actualizando cliente:', err);
                                return res.status(500).json({ error: 'Error actualizando cliente' });
                            }

                            res.status(201).json({
                                message: 'Multa creada y monto actualizado',
                                nuevoMonto,
                                nuevaFechaTermino,
                                totalMultasHoy,
                                totalMultasSemanales
                            });
                        }
                    );
                });
            }
        );
    });
});









app.post('/clientes/:id/abonos', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;
    const { monto, fecha } = req.body;

    if (!monto || !fecha) {
        return res.status(400).json({ error: 'Monto y fecha son campos requeridos' });
    }

    db.query(
        'SELECT monto_actual, estado FROM clientes WHERE id = ?',
        [clienteId],
        (err, results) => {
            if (err) {
                console.error('Error al verificar el estado del cliente:', err);
                return res.status(500).json({ error: 'Error al verificar el estado del cliente' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'Cliente no encontrado' });
            }

            const cliente = results[0];

            if (cliente.estado === 'completado') {
                return res.status(400).json({ error: 'No se pueden agregar más abonos, el cliente está completado' });
            }

            const nuevoMontoActual = cliente.monto_actual - parseFloat(monto);


            db.query(
                'INSERT INTO abonos (cliente_id, monto, abono_diario, abono_semanal, fecha, estado) VALUES (?, ?, ?, ?, ?, ?)',
                [clienteId, parseFloat(monto), parseFloat(monto), parseFloat(monto), fecha, 'pagado'],
                (err, result) => {
                    if (err) {
                        console.error('Error creando abono:', err);
                        return res.status(500).json({ error: 'Error creando abono' });
                    }
            
                    db.query(
                        'UPDATE clientes SET monto_actual = ?, estado = ? WHERE id = ?',
                        [nuevoMontoActual, nuevoMontoActual <= 0 ? 'completado' : cliente.estado, clienteId],
                        (updateErr) => {
                            if (updateErr) {
                                console.error('Error actualizando monto actual del cliente:', updateErr);
                                return res.status(500).json({ error: 'Error actualizando monto actual del cliente' });
                            }
            
                            res.status(201).json({
                                message: nuevoMontoActual <= 0 ? 'Abono creado y cliente completado' : 'Abono creado',
                                abonoId: result.insertId
                            });
                        }
                    );
                }
            );
        }
    );
});



app.get('/clientes/:id/abonos', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    db.query('SELECT id, monto, fecha, estado FROM abonos WHERE cliente_id = ?', [clienteId], (err, result) => {
        if (err) {
            console.error('Error obteniendo abonos:', err);
            return res.status(500).json({ error: 'Error obteniendo abonos' });
        }

        res.json(result);
    });
});




app.get('/trabajadores', authenticateJWT, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const query = `
        SELECT u.id, u.nombre, u.email, u.role, c.id AS cliente_id, c.nombre AS cliente_nombre, c.ocupacion, c.direccion, c.telefono, c.fecha_inicio, c.fecha_termino, c.monto_inicial, c.monto_actual, c.estado, COUNT(m.id) AS total_multas, COUNT(a.id) AS total_abonos
        FROM usuarios u
        LEFT JOIN clientes c ON u.id = c.trabajador_id
        LEFT JOIN multas m ON c.id = m.cliente_id
        LEFT JOIN abonos a ON c.id = a.cliente_id
        WHERE u.role = 'trabajador'
        GROUP BY u.id, c.id
        ORDER BY u.nombre, c.nombre`;

    db.query(query, (err, result) => {
        if (err) {
            console.error('Error obteniendo trabajadores:', err);
            return res.status(500).json({ error: 'Error obteniendo trabajadores' });
        }

        const trabajadores = result.reduce((acc, row) => {
            const trabajador = acc.find(t => t.id === row.id);
            if (trabajador) {
                trabajador.clientes.push({
                    id: row.cliente_id,
                    nombre: row.cliente_nombre,
                    ocupacion: row.ocupacion,
                    direccion: row.direccion,
                    telefono: row.telefono,
                    fecha_inicio: row.fecha_inicio,
                    fecha_termino: row.fecha_termino,
                    monto_inicial: row.monto_inicial,
                    monto_actual: row.monto_actual,
                    estado: row.estado,
                    total_multas: row.total_multas,
                    total_abonos: row.total_abonos
                });
            } else {
                acc.push({
                    id: row.id,
                    nombre: row.nombre,
                    email: row.email,
                    role: row.role,
                    clientes: row.cliente_id ? [{
                        id: row.cliente_id,
                        nombre: row.cliente_nombre,
                        ocupacion: row.ocupacion,
                        direccion: row.direccion,
                        telefono: row.telefono,
                        fecha_inicio: row.fecha_inicio,
                        fecha_termino: row.fecha_termino,
                        monto_inicial: row.monto_inicial,
                        monto_actual: row.monto_actual,
                        estado: row.estado,
                        total_multas: row.total_multas,
                        total_abonos: row.total_abonos
                    }] : []
                });
            }
            return acc;
        }, []);

        res.json(trabajadores);
    });
});
app.get('/trabajadores/:id/clientes', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;

    const query = `
        SELECT c.*, COUNT(m.id) AS total_multas 
        FROM clientes c 
        LEFT JOIN multas m ON c.id = m.cliente_id 
        WHERE c.trabajador_id = ? 
        GROUP BY c.id`;

    db.query(query, [trabajadorId], (err, result) => {
        if (err) {
            console.error('Error obteniendo clientes:', err);
            return res.status(500).json({ error: 'Error obteniendo clientes' });
        }
        res.json(result);
    });
});

app.post('/trabajadores', authenticateJWT, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const { nombre, email, password, role } = req.body;

    if (!nombre || !email || !password || !role) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    db.query('INSERT INTO usuarios (nombre, email, password, role) VALUES (?, ?, ?, ?)', [nombre, email, password, role], (err, result) => {
        if (err) {
            console.error('Error creando trabajador:', err);
            return res.status(500).json({ error: 'Error creando trabajador' });
        }
        res.status(201).json({ message: 'Trabajador creado', id: result.insertId });
    });
});

app.put('/trabajadores/:id', authenticateJWT, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;
    const { nombre, email, role } = req.body;

    if (!nombre || !email || !role) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    db.query(
        'UPDATE usuarios SET nombre = ?, email = ?, role = ? WHERE id = ?',
        [nombre, email, role, trabajadorId],
        (err, result) => {
            if (err) {
                console.error('Error actualizando trabajador:', err);
                return res.status(500).json({ error: 'Error actualizando trabajador' });
            }
            res.status(200).json({ message: 'Trabajador actualizado' });
        }
    );
});

app.delete('/trabajadores/:id', authenticateJWT, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const trabajadorId = req.params.id;

    db.query('DELETE FROM usuarios WHERE id = ?', [trabajadorId], (err, result) => {
        if (err) {
            console.error('Error eliminando trabajador:', err);
            return res.status(500).json({ error: 'Error eliminando trabajador' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Trabajador no encontrado' });
        }

        res.status(200).json({ message: 'Trabajador eliminado' });
    });
});

// Ruta para eliminar un cliente
app.delete('/clientes/:id', authenticateJWT, (req, res) => {
    if (req.user.role !== 'trabajador' && req.user.role !== 'admin') return res.sendStatus(403);

    const clienteId = req.params.id;

    db.query('DELETE FROM clientes WHERE id = ?', [clienteId], (err, result) => {
        if (err) {
            console.error('Error eliminando cliente:', err);
            return res.status(500).json({ error: 'Error eliminando cliente' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.status(200).json({ message: 'Cliente eliminado correctamente' });
    });
});

app.get('/estadisticas/general', authenticateJWT, (req, res) => {
    const query = `
        SELECT c.id, c.nombre, c.telefono, c.monto_inicial, c.fecha_inicio, c.fecha_termino, c.ocupacion, c.estado, c.direccion,
            DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 AS dias_prestamo,
            CASE 
                WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 15 THEN ROUND((c.monto_inicial * 1.30) / 15, 2) 
                WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 20 THEN ROUND((c.monto_inicial * 1.30) / 20, 2) 
                ELSE NULL 
            END AS cobro_diario
        FROM clientes c
        GROUP BY c.id;
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error('Error obteniendo estadísticas generales:', err);
            return res.status(500).json({ error: 'Error obteniendo estadísticas generales' });
        }
        res.json(result);
    });
});

app.get('/estadisticas/trabajadores', authenticateJWT, (req, res) => {
    const query = `
   SELECT 
    u.id AS trabajador_id, 
    u.nombre AS trabajador_nombre,
    SUM(a.abono_diario) AS total_abonos_diarios,
    SUM(a.abono_semanal) AS total_abonos_semanales,
    SUM(c.total_multas_hoy) AS total_multas_hoy,
    SUM(c.total_multas_semanales) AS total_multas_semanales
FROM usuarios u
LEFT JOIN clientes c ON u.id = c.trabajador_id
LEFT JOIN abonos a ON c.id = a.cliente_id
GROUP BY u.id, u.nombre;

    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error obteniendo estadísticas de trabajadores:', err);
            return res.status(500).json({ error: 'Error obteniendo estadísticas de trabajadores' });
        }

        res.json(results);
    });
});



// Cron job que se ejecuta diariamente a las 5 a.m. hora de México
cron.schedule('19 1 * * *', () => {
    const resetAbonoDiarioQuery = 'UPDATE abonos SET abono_diario = 0 WHERE abono_diario != 0';

    db.query(resetAbonoDiarioQuery, (err, result) => {
        if (err) {
            console.error('Error al reiniciar el campo abono_diario:', err);
        } else {
            console.log('Campo abono_diario reiniciado a 0 para todos los registros.');
        }
    });
}, {
    timezone: "America/Mexico_City"  // Ajuste para la zona horaria de México
});

cron.schedule('0 5 * * 1', () => {
    const resetAbonoDiarioQuery = 'UPDATE abonos SET abono_semanal = 0 WHERE abono_semanal != 0';

    db.query(resetAbonoDiarioQuery, (err, result) => {
        if (err) {
            console.error('Error al reiniciar el campo abono_diario:', err);
        } else {
            console.log('Campo abono_diario reiniciado a 0 para todos los registros.');
        }
    });
}, {
    timezone: "America/Mexico_City"  // Ajuste para la zona horaria de México
});

// Cron job que se ejecuta diariamente a las 5 a.m. hora de México
cron.schedule('17 1 * * *', () => {
    const resetAbonoDiarioQuery = 'UPDATE clientes SET total_multas_hoy = 0 WHERE total_multas_hoy != 0';

    db.query(resetAbonoDiarioQuery, (err, result) => {
        if (err) {
            console.error('Error al reiniciar el campo abono_diario:', err);
        } else {
            console.log('Campo total_multas_hoy reiniciado a 0 para todos los registros.');
        }
    });
}, {
    timezone: "America/Mexico_City"  // Ajuste para la zona horaria de México
});
cron.schedule('3 12 * * *', () => {
    const resetAbonoDiarioQuery = 'UPDATE clientes SET total_multas_semanales = 0 WHERE total_multas_semanales != 0';

    db.query(resetAbonoDiarioQuery, (err, result) => {
        if (err) {
            console.error('Error al reiniciar el campo abono_diario:', err);
        } else {
            console.log('Campo total_multas_semanales reiniciado a 0 para todos los registros.');
        }
    });
}, {
    timezone: "America/Mexico_City"  // Ajuste para la zona horaria de México
});




// Ruta para obtener resumen de un cliente en específico
app.get('/estadisticas/cliente/:id', authenticateJWT, (req, res) => {
    const clienteId = req.params.id;

    const query = `
        SELECT c.id, c.nombre, c.direccion, c.telefono, c.monto_inicial, c.fecha_inicio, c.fecha_termino, c.ocupacion, 
               DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 AS dias_prestamo,
               CASE 
                   WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 15 THEN ROUND((c.monto_inicial * 1.30) / 15, 2) 
                   WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 20 THEN ROUND((c.monto_inicial * 1.30) / 20, 2) 
                   ELSE NULL 
               END AS cobro_diario,
               SUM(m.monto) AS total_multas, 
               SUM(a.monto) AS total_abonos
        FROM clientes c
        LEFT JOIN multas m ON c.id = m.cliente_id
        LEFT JOIN abonos a ON c.id = a.cliente_id
        WHERE c.id = ?
        GROUP BY c.id;
    `;

    db.query(query, [clienteId], (err, result) => {
        if (err) {
            console.error('Error obteniendo estadísticas del cliente:', err);
            return res.status(500).json({ error: 'Error obteniendo estadísticas del cliente' });
        }
        res.json(result[0]);
    });
});

app.get('/estadisticas/trabajador/:id', authenticateJWT, (req, res) => {
    const trabajadorId = req.params.id;

    const query = `
        SELECT 
            c.id, 
            c.nombre, 
            c.telefono, 
            c.monto_inicial, 
            c.fecha_inicio, 
            c.fecha_termino, 
            c.ocupacion, 
            DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 AS dias_prestamo,
            CASE 
                WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 15 THEN ROUND((c.monto_inicial * 1.30) / 15, 2) 
                WHEN DATEDIFF(c.fecha_termino, c.fecha_inicio) + 1 = 20 THEN ROUND((c.monto_inicial * 1.30) / 20, 2) 
                ELSE NULL 
            END AS cobro_diario,
            SUM(m.monto) AS total_multas, 
            SUM(a.monto) AS total_abonos
        FROM clientes c
        LEFT JOIN multas m ON c.id = m.cliente_id
        LEFT JOIN abonos a ON c.id = a.cliente_id
        WHERE c.trabajador_id = ?
        GROUP BY c.id;
    `;

    db.query(query, [trabajadorId], (err, results) => {
        if (err) {
            console.error('Error al obtener estadísticas del trabajador:', err);
            return res.status(500).json({ error: 'Error al obtener estadísticas del trabajador' });
        }

        res.json(results);
    });
});



app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
