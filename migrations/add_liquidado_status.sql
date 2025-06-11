-- Migration to add 'liquidado' status to prestamos table
-- This assumes the table already exists with a check constraint for estado

-- First, drop any existing check constraint on estado column
ALTER TABLE prestamos DROP CONSTRAINT IF EXISTS prestamos_estado_check;

-- Add new check constraint that includes 'liquidado' status
ALTER TABLE prestamos ADD CONSTRAINT prestamos_estado_check 
CHECK (estado IN ('activo', 'completado', 'atrasado', 'liquidado'));

-- Update any existing completed loans to maintain data integrity
-- (This is optional - you can skip this if you want to keep existing 'completado' status)
-- UPDATE prestamos SET estado = 'liquidado' WHERE estado = 'completado' AND observaciones LIKE '%liquidado%';

-- Add comment for documentation
COMMENT ON COLUMN prestamos.estado IS 'Estado del préstamo: activo, completado, atrasado, liquidado'; 