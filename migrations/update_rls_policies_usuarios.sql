-- Primero eliminamos las políticas existentes
DROP POLICY IF EXISTS "Usuarios pueden ver sus propios datos" ON usuarios;
DROP POLICY IF EXISTS "Administradores pueden ver todos los usuarios" ON usuarios;
DROP POLICY IF EXISTS "Administradores pueden crear usuarios" ON usuarios;
DROP POLICY IF EXISTS "Usuarios pueden actualizar sus propios datos" ON usuarios;
DROP POLICY IF EXISTS "Administradores pueden actualizar cualquier usuario" ON usuarios;
DROP POLICY IF EXISTS "Administradores pueden eliminar usuarios" ON usuarios;
DROP POLICY IF EXISTS "Servicio backend tiene acceso total a usuarios" ON usuarios;

-- Habilitar RLS en la tabla usuarios
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Política para permitir que los usuarios vean sus propios datos
CREATE POLICY "Usuarios pueden ver sus propios datos"
ON usuarios
FOR SELECT
TO authenticated
USING (
    auth.uid() = auth_id
);

-- Política para permitir que los administradores vean todos los usuarios
CREATE POLICY "Administradores pueden ver todos los usuarios"
ON usuarios
FOR SELECT
TO authenticated
USING (
    (auth.jwt() ->> 'role')::text = 'admin'
);

-- Política para permitir que los administradores creen usuarios
CREATE POLICY "Administradores pueden crear usuarios"
ON usuarios
FOR INSERT
TO authenticated
WITH CHECK (
    (auth.jwt() ->> 'role')::text = 'admin'
);

-- Política para permitir que los usuarios actualicen sus propios datos
CREATE POLICY "Usuarios pueden actualizar sus propios datos"
ON usuarios
FOR UPDATE
TO authenticated
USING (
    auth.uid() = auth_id
)
WITH CHECK (
    auth.uid() = auth_id
);

-- Política para permitir que los administradores actualicen cualquier usuario
CREATE POLICY "Administradores pueden actualizar cualquier usuario"
ON usuarios
FOR UPDATE
TO authenticated
USING (
    (auth.jwt() ->> 'role')::text = 'admin'
)
WITH CHECK (
    (auth.jwt() ->> 'role')::text = 'admin'
);

-- Política para permitir que los administradores eliminen usuarios
CREATE POLICY "Administradores pueden eliminar usuarios"
ON usuarios
FOR DELETE
TO authenticated
USING (
    (auth.jwt() ->> 'role')::text = 'admin'
);

-- Política para permitir que el servicio backend tenga acceso total
CREATE POLICY "Servicio backend tiene acceso total a usuarios"
ON usuarios
FOR ALL
TO service_role
USING (true)
WITH CHECK (true); 