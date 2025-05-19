-- Habilitar RLS en la tabla clientes
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Política para permitir que los trabajadores vean sus propios clientes
CREATE POLICY "Trabajadores pueden ver sus clientes"
ON clientes
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = clientes.trabajador_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que los trabajadores creen nuevos clientes
CREATE POLICY "Trabajadores pueden crear clientes"
ON clientes
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = clientes.trabajador_id
        AND u.auth_id = auth.uid()
        AND u.role = 'trabajador'
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que los trabajadores actualicen sus clientes
CREATE POLICY "Trabajadores pueden actualizar sus clientes"
ON clientes
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = clientes.trabajador_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = clientes.trabajador_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que los administradores eliminen clientes
CREATE POLICY "Administradores pueden eliminar clientes"
ON clientes
FOR DELETE
TO authenticated
USING (
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que el servicio backend acceda a la tabla
CREATE POLICY "Servicio backend tiene acceso total a clientes"
ON clientes
USING (
    auth.role() = 'service_role'
);

-- Política para permitir que los trabajadores transfieran clientes entre ellos
CREATE POLICY "Trabajadores pueden transferir clientes"
ON clientes
FOR UPDATE
TO authenticated
USING (
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
    OR
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = clientes.trabajador_id
        AND u.auth_id = auth.uid()
        AND u.role = 'trabajador'
    )
)
WITH CHECK (
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
    OR
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = clientes.trabajador_id
        AND u.auth_id = auth.uid()
        AND u.role = 'trabajador'
    )
); 