-- Agregar campo deleted_at a la tabla prestamos para soft delete
ALTER TABLE prestamos 
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Crear índice para mejorar el rendimiento de las consultas
CREATE INDEX idx_prestamos_deleted_at ON prestamos(deleted_at);

-- Comentario sobre el campo
COMMENT ON COLUMN prestamos.deleted_at IS 'Timestamp cuando el préstamo fue eliminado (soft delete). NULL = activo, no NULL = eliminado'; 