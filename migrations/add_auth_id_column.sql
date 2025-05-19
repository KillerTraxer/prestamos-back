-- Añadir columna auth_id a la tabla usuarios
ALTER TABLE usuarios 
ADD COLUMN auth_id UUID;

-- Crear un índice para mejorar el rendimiento de búsquedas por auth_id
CREATE INDEX idx_usuarios_auth_id ON usuarios(auth_id);

-- Añadir un comentario a la columna para documentación
COMMENT ON COLUMN usuarios.auth_id IS 'ID del usuario en Supabase Auth'; 