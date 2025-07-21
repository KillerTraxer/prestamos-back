-- Migración: Agregar campos liquidado_personalizado y liquidacion_amount a la tabla prestamos

ALTER TABLE prestamos
ADD COLUMN liquidado_personalizado BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN prestamos.liquidado_personalizado IS 'Indica si la liquidación fue personalizada (true) o automática (false)';

ALTER TABLE prestamos
ADD COLUMN liquidacion_amount NUMERIC;

COMMENT ON COLUMN prestamos.liquidacion_amount IS 'Monto personalizado con el que se liquidó el préstamo (nullable)'; 