-- Agregar campo deleted_at a la tabla multas para soft delete
ALTER TABLE multas 
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Crear índice para mejorar el rendimiento de las consultas
CREATE INDEX idx_multas_deleted_at ON multas(deleted_at);

-- Comentario sobre el campo
COMMENT ON COLUMN multas.deleted_at IS 'Timestamp cuando la multa fue eliminada (soft delete). NULL = activa, no NULL = eliminada'; 