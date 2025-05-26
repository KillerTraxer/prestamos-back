-- Crear la tabla de trabajadores
CREATE TABLE trabajadores (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX idx_trabajadores_email ON trabajadores(email);
CREATE INDEX idx_trabajadores_usuario_id ON trabajadores(usuario_id);

-- Habilitar RLS en la tabla trabajadores
ALTER TABLE trabajadores ENABLE ROW LEVEL SECURITY;

-- Política para permitir que los administradores vean todos los trabajadores
CREATE POLICY "Administradores pueden ver todos los trabajadores"
ON trabajadores
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'admin'
    )
);

-- Política para permitir que los administradores creen trabajadores
CREATE POLICY "Administradores pueden crear trabajadores"
ON trabajadores
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'admin'
    )
);

-- Política para permitir que los administradores actualicen trabajadores
CREATE POLICY "Administradores pueden actualizar trabajadores"
ON trabajadores
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'admin'
    )
);

-- Política para permitir que los administradores eliminen trabajadores
CREATE POLICY "Administradores pueden eliminar trabajadores"
ON trabajadores
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'admin'
    )
);

-- Política para permitir que el servicio backend acceda a la tabla
CREATE POLICY "Servicio backend tiene acceso total a trabajadores"
ON trabajadores
USING (
    auth.role() = 'service_role'
);

-- Trigger para actualizar el updated_at
CREATE OR REPLACE FUNCTION update_trabajadores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trabajadores_updated_at
    BEFORE UPDATE ON trabajadores
    FOR EACH ROW
    EXECUTE FUNCTION update_trabajadores_updated_at(); 