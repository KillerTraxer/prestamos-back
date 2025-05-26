const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

transporter.sendMail = transporter.sendMail.bind(transporter);

const sendEmailNotification = (subject, body) => {
    transporter.sendMail({
        from: '"Prestamos" <alison.cassin70@ethereal.email>',
        to: 'eduardogf312@gmail.com',
        subject: subject,
        text: body
    })
    .then(info => {
        console.log('Correo enviado: ' + info.response);
    })
    .catch(error => {
        console.error('Error al enviar correo:', error);
    });
};

module.exports = { sendEmailNotification }; 