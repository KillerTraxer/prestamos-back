const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

/**
 * Hashea una contraseña usando bcrypt
 * @param {string} password - La contraseña en texto plano
 * @returns {Promise<string>} - La contraseña hasheada
 */
const hashPassword = async (password) => {
    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        const hash = await bcrypt.hash(password, salt);
        return hash;
    } catch (error) {
        console.error('Error hasheando contraseña:', error);
        throw new Error('Error al hashear la contraseña');
    }
};

/**
 * Verifica si una contraseña coincide con su hash
 * @param {string} password - La contraseña en texto plano
 * @param {string} hash - El hash de la contraseña
 * @returns {Promise<boolean>} - true si la contraseña coincide, false si no
 */
const verifyPassword = async (password, hash) => {
    try {
        const match = await bcrypt.compare(password, hash);
        return match;
    } catch (error) {
        console.error('Error verificando contraseña:', error);
        throw new Error('Error al verificar la contraseña');
    }
};

/**
 * Valida que una contraseña cumpla con los requisitos mínimos de seguridad
 * @param {string} password - La contraseña a validar
 * @returns {Object} - Objeto con el resultado de la validación
 */
const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const isValid = password.length >= minLength &&
        hasUpperCase &&
        hasLowerCase &&
        hasNumbers &&
        hasSpecialChar;

    return {
        isValid,
        errors: {
            length: password.length < minLength ? 'La contraseña debe tener al menos 8 caracteres' : null,
            upperCase: !hasUpperCase ? 'La contraseña debe contener al menos una mayúscula' : null,
            lowerCase: !hasLowerCase ? 'La contraseña debe contener al menos una minúscula' : null,
            numbers: !hasNumbers ? 'La contraseña debe contener al menos un número' : null,
            specialChar: !hasSpecialChar ? 'La contraseña debe contener al menos un carácter especial' : null
        }
    };
};

/**
 * Genera una contraseña temporal aleatoria
 * @param {number} length - Longitud de la contraseña a generar
 * @returns {string} - Contraseña temporal generada
 */
const generateTempPassword = (length = 12) => {
    const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specialChars = '!@#$%^&*(),.?":{}|<>';
    
    const allChars = upperChars + lowerChars + numbers + specialChars;
    let password = '';

    // Asegurar al menos un carácter de cada tipo
    password += upperChars[Math.floor(Math.random() * upperChars.length)];
    password += lowerChars[Math.floor(Math.random() * lowerChars.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += specialChars[Math.floor(Math.random() * specialChars.length)];

    // Completar el resto de la contraseña
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Mezclar la contraseña
    return password.split('').sort(() => Math.random() - 0.5).join('');
};

module.exports = {
    hashPassword,
    verifyPassword,
    validatePassword,
    generateTempPassword
}; 