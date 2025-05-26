const calcularInteresTotal = (montoInicial, tasaInteres) => {
    return montoInicial * tasaInteres;
};

const calcularTotalAPagar = (montoInicial, interesTotal) => {
    return montoInicial + interesTotal;
};

const calcularPagosDiarios = (totalAPagar, dias) => {
    return totalAPagar / dias;
};

module.exports = {
    calcularInteresTotal,
    calcularTotalAPagar,
    calcularPagosDiarios
}; 