-- Habilitar RLS en la tabla multas
ALTER TABLE multas ENABLE ROW LEVEL SECURITY;

-- Política para permitir que los trabajadores vean las multas de sus clientes
CREATE POLICY "Trabajadores pueden ver multas de sus clientes"
ON multas
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = multas.cliente_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que los trabajadores creen multas para sus clientes
CREATE POLICY "Trabajadores pueden crear multas"
ON multas
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = multas.cliente_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que los trabajadores actualicen multas de sus clientes
CREATE POLICY "Trabajadores pueden actualizar multas"
ON multas
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = multas.cliente_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = multas.cliente_id
        AND u.auth_id = auth.uid()
    )
    OR
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que los administradores eliminen multas
CREATE POLICY "Administradores pueden eliminar multas"
ON multas
FOR DELETE
TO authenticated
USING (
    (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'
);

-- Política para permitir que el servicio backend acceda a la tabla
CREATE POLICY "Servicio backend tiene acceso total a multas"
ON multas
USING (
    auth.role() = 'service_role'
);

-- Política para permitir que los trabajadores vean las multas de sus clientes (incluyendo clientes)
CREATE POLICY "Trabajadores y clientes pueden ver multas relevantes"
ON multas
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM clientes c
        JOIN usuarios u ON c.trabajador_id = u.id
        WHERE c.id = multas.cliente_id
        AND (
            u.auth_id = auth.uid()  -- Es el trabajador asignado
            OR
            (SELECT role FROM usuarios WHERE auth_id = auth.uid()) = 'admin'  -- Es un administrador
        )
    )
); 