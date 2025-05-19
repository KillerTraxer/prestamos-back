-- Habilitar RLS en la tabla abonos
ALTER TABLE abonos ENABLE ROW LEVEL SECURITY;

-- Política para permitir que los trabajadores vean los abonos de sus clientes
CREATE POLICY "Trabajadores pueden ver abonos de sus clientes"
ON abonos
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = abonos.cliente_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que los trabajadores registren abonos para sus clientes
CREATE POLICY "Trabajadores pueden registrar abonos"
ON abonos
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = abonos.cliente_id
        AND u.auth_id = auth.uid()
        AND u.role = 'trabajador'
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que los trabajadores actualicen abonos de sus clientes
CREATE POLICY "Trabajadores pueden actualizar abonos"
ON abonos
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = abonos.cliente_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = abonos.cliente_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que los administradores eliminen abonos
CREATE POLICY "Administradores pueden eliminar abonos"
ON abonos
FOR DELETE
TO authenticated
USING (
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que el servicio backend acceda a la tabla
CREATE POLICY "Servicio backend tiene acceso total a abonos"
ON abonos
USING (
    auth.role() = 'service_role'
);

-- Política para permitir que los trabajadores vean el historial de abonos
CREATE POLICY "Trabajadores pueden ver historial de abonos"
ON abonos
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = abonos.cliente_id
        AND u.auth_id = auth.uid()
        AND u.role = 'trabajador'
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
); 