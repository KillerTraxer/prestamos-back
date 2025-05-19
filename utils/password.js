const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const passwordUtils = {
    // Función para hashear una contraseña
    async hashPassword(password) {
        try {
            const salt = await bcrypt.genSalt(SALT_ROUNDS);
            return await bcrypt.hash(password, salt);
        } catch (error) {
            console.error('Error hasheando contraseña:', error);
            throw error;
        }
    },

    // Función para verificar una contraseña
    async verifyPassword(password, hashedPassword) {
        try {
            return await bcrypt.compare(password, hashedPassword);
        } catch (error) {
            console.error('Error verificando contraseña:', error);
            throw error;
        }
    }
};

module.exports = passwordUtils; 