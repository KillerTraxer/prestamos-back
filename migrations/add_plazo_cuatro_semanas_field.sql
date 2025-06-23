-- Migración: Agregar campo plazo_cuatro_semanas a la tabla prestamos
-- Esta columna indica si el préstamo tiene un plazo de 4 semanas (28 días)

-- Agregar la columna plazo_cuatro_semanas
ALTER TABLE prestamos 
ADD COLUMN plazo_cuatro_semanas BOOLEAN DEFAULT FALSE;

-- Comentario para la columna
COMMENT ON COLUMN prestamos.plazo_cuatro_semanas IS 'Indica si el préstamo tiene un plazo de 4 semanas (28 días)';

-- Actualizar registros existentes que tengan exactamente 28 días de duración
UPDATE prestamos 
SET plazo_cuatro_semanas = TRUE 
WHERE DATE_PART('day', fecha_fin::timestamp - fecha_inicio::timestamp) + 1 = 28;

-- Verificar los cambios
SELECT COUNT(*) as total_prestamos, 
       COUNT(*) FILTER (WHERE plazo_cuatro_semanas = TRUE) as prestamos_4_semanas
FROM prestamos; 