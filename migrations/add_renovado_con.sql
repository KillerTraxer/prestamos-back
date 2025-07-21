-- Migración: Agregar campo renovado_con a la tabla prestamos

ALTER TABLE prestamos
ADD COLUMN renovado_con NUMERIC;

COMMENT ON COLUMN prestamos.renovado_con IS 'Monto real entregado al renovar el préstamo (diferente al solicitado si se descuenta saldo pendiente)'; 