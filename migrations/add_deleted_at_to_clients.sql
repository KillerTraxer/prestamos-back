-- Agregar campo deleted_at a la tabla clientes para soft delete
ALTER TABLE clientes 
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Crear índice para mejorar el rendimiento de las consultas
CREATE INDEX idx_clientes_deleted_at ON clientes(deleted_at);

-- Comentario sobre el campo
COMMENT ON COLUMN clientes.deleted_at IS 'Timestamp cuando el cliente fue eliminado (soft delete). NULL = activo, no NULL = eliminado'; 