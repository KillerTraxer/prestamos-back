-- Agregar campo deleted_at a la tabla adeudos para soft delete
ALTER TABLE adeudos 
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Crear índice para mejorar el rendimiento de las consultas
CREATE INDEX idx_adeudos_deleted_at ON adeudos(deleted_at);

-- Comentario sobre el campo
COMMENT ON COLUMN adeudos.deleted_at IS 'Timestamp cuando el adeudo fue eliminado (soft delete). NULL = activo, no NULL = eliminado'; 