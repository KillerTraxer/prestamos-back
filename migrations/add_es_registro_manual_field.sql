-- Migración para agregar el campo es_registro_manual a la tabla prestamos
-- Este campo indica si el préstamo fue creado con fecha personalizada (registro manual)

-- Agregar la columna es_registro_manual a la tabla prestamos
ALTER TABLE prestamos 
ADD COLUMN es_registro_manual BOOLEAN DEFAULT false;

-- Agregar comentario para documentar el campo
COMMENT ON COLUMN prestamos.es_registro_manual IS 'Indica si el préstamo fue creado con fecha personalizada (true) o fecha automática (false)';

-- Actualizar registros existentes para que tengan valor false por defecto
UPDATE prestamos 
SET es_registro_manual = false 
WHERE es_registro_manual IS NULL;

-- Hacer que el campo no sea nulo
ALTER TABLE prestamos 
ALTER COLUMN es_registro_manual SET NOT NULL; 