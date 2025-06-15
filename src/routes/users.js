const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const User = require('../models/User');
const Trabajador = require('../models/Trabajador');
const { auth } = require('../config/supabase');

// Obtener perfil del usuario actual
router.get('/profile', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        
        let userData;
        
        if (userRole === 'admin') {
            // Para admins, obtener datos de la tabla usuarios
            userData = await User.findById(userId);
        } else if (userRole === 'trabajador') {
            // Para trabajadores, obtener datos de la tabla trabajadores
            userData = await Trabajador.findById(userId);
        } else {
            return res.status(400).json({
                error: 'Rol no válido',
                message: 'El rol del usuario no es válido'
            });
        }
        
        if (!userData) {
            return res.status(404).json({
                error: 'Usuario no encontrado',
                message: 'No se encontraron datos del usuario'
            });
        }
        
        res.json({
            message: 'Perfil obtenido exitosamente',
            user: userData
        });
        
    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        res.status(500).json({
            error: 'Error obteniendo perfil',
            message: error.message
        });
    }
});

// Actualizar perfil del usuario actual
router.put('/profile', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        const { nombre, email, phone } = req.body;
        
        // Validar campos requeridos
        if (!nombre || !email) {
            return res.status(400).json({
                error: 'Campos requeridos',
                message: 'El nombre y email son obligatorios'
            });
        }
        
        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Email inválido',
                message: 'El formato del email no es válido'
            });
        }
        
        let updatedUser;
        let tableName;
        
        if (userRole === 'admin') {
            // Para admins, actualizar en la tabla usuarios
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    error: 'Usuario no encontrado',
                    message: 'No se encontró el usuario administrador'
                });
            }
            
            // Verificar si el email ya está en uso por otro usuario
            if (email !== user.email) {
                const existingUser = await User.findByEmail(email);
                if (existingUser && existingUser.id !== userId) {
                    return res.status(409).json({
                        error: 'Email duplicado',
                        message: 'El email ya está registrado por otro usuario'
                    });
                }
                
                // También verificar en la tabla trabajadores
                try {
                    const existingWorker = await Trabajador.findByEmail(email);
                    if (existingWorker) {
                        return res.status(409).json({
                            error: 'Email duplicado',
                            message: 'El email ya está registrado por un trabajador'
                        });
                    }
                } catch (error) {
                    // Si no encuentra trabajador, es normal, continuar
                    if (!error.message.includes('not found') && error.code !== 'PGRST116') {
                        throw error;
                    }
                }
            }
            
            // Actualizar datos del admin
            updatedUser = await user.update({
                nombre: nombre.trim(),
                email: email.trim().toLowerCase()
            });
            
            tableName = 'usuarios';
            
        } else if (userRole === 'trabajador') {
            // Para trabajadores, actualizar en la tabla trabajadores
            const trabajador = await Trabajador.findById(userId);
            if (!trabajador) {
                return res.status(404).json({
                    error: 'Trabajador no encontrado',
                    message: 'No se encontró el trabajador'
                });
            }
            
            // Verificar si el email ya está en uso
            if (email !== trabajador.email) {
                // Verificar en tabla trabajadores
                try {
                    const existingWorker = await Trabajador.findByEmail(email);
                    if (existingWorker && existingWorker.id !== userId) {
                        return res.status(409).json({
                            error: 'Email duplicado',
                            message: 'El email ya está registrado por otro trabajador'
                        });
                    }
                } catch (error) {
                    // Si no encuentra trabajador, es normal, continuar
                    if (!error.message.includes('not found') && error.code !== 'PGRST116') {
                        throw error;
                    }
                }
                
                // También verificar en la tabla usuarios
                try {
                    const existingUser = await User.findByEmail(email);
                    if (existingUser) {
                        return res.status(409).json({
                            error: 'Email duplicado',
                            message: 'El email ya está registrado por un administrador'
                        });
                    }
                } catch (error) {
                    // Si no encuentra usuario, es normal, continuar
                    if (!error.message.includes('not found') && error.code !== 'PGRST116') {
                        throw error;
                    }
                }
            }
            
            // Preparar datos de actualización
            const updateData = {
                nombre: nombre.trim(),
                email: email.trim().toLowerCase()
            };
            
            // Solo agregar phone si se proporciona
            if (phone !== undefined && phone !== null) {
                updateData.phone = phone.trim();
            }
            
            // Actualizar datos del trabajador
            updatedUser = await trabajador.update(updateData);
            tableName = 'trabajadores';
            
        } else {
            return res.status(400).json({
                error: 'Rol no válido',
                message: 'El rol del usuario no es válido'
            });
        }
        
        // Actualizar también en Supabase Auth si hay cambios en email o nombre
        if (updatedUser.auth_id && (email !== req.user.email || nombre !== req.user.nombre)) {
            try {
                const authUpdateData = {};
                
                if (email !== req.user.email) {
                    authUpdateData.email = email.trim().toLowerCase();
                }
                
                // Actualizar metadatos del usuario
                authUpdateData.user_metadata = {
                    nombre: nombre.trim(),
                    role: userRole
                };
                
                const { error: authError } = await auth.supabaseAdmin.auth.admin.updateUserById(
                    updatedUser.auth_id,
                    authUpdateData
                );
                
                if (authError) {
                    console.error('Error actualizando usuario en Auth:', authError);
                    // No fallar la actualización si hay error en Auth, solo loggear
                }
            } catch (authError) {
                console.error('Error en actualización de Auth:', authError);
                // No fallar la actualización si hay error en Auth, solo loggear
            }
        }
        
        console.log(`Perfil actualizado exitosamente en ${tableName}:`, {
            userId,
            userRole,
            updatedFields: { nombre, email, ...(phone && { phone }) }
        });
        
        res.json({
            message: 'Perfil actualizado exitosamente',
            user: {
                id: updatedUser.id,
                nombre: updatedUser.nombre,
                email: updatedUser.email,
                role: updatedUser.role,
                ...(updatedUser.phone && { phone: updatedUser.phone })
            }
        });
        
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        
        if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
            return res.status(409).json({
                error: 'Email duplicado',
                message: 'El email ya está registrado por otro usuario'
            });
        }
        
        res.status(500).json({
            error: 'Error actualizando perfil',
            message: error.message
        });
    }
});

module.exports = router; 