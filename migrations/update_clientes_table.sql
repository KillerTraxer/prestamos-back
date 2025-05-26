-- Primero, crear una tabla temporal para mantener las relaciones existentes
CREATE TEMP TABLE temp_clientes AS
SELECT * FROM clientes;

-- Eliminar la restricción de clave foránea existente
ALTER TABLE clientes
DROP CONSTRAINT IF EXISTS clientes_trabajador_id_fkey;

-- Actualizar la referencia a la nueva tabla de trabajadores
ALTER TABLE clientes
ADD CONSTRAINT clientes_trabajador_id_fkey
FOREIGN KEY (trabajador_id)
REFERENCES trabajadores(id)
ON DELETE SET NULL;

-- Actualizar las políticas de RLS para usar la nueva tabla de trabajadores
DROP POLICY IF EXISTS "Trabajadores pueden ver sus clientes" ON clientes;
DROP POLICY IF EXISTS "Trabajadores pueden crear clientes" ON clientes;
DROP POLICY IF EXISTS "Trabajadores pueden actualizar sus clientes" ON clientes;

-- Crear las nuevas políticas
CREATE POLICY "Trabajadores pueden ver sus clientes"
ON clientes
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM trabajadores t
        WHERE t.id = clientes.trabajador_id
        AND t.email = auth.jwt() ->> 'email'
    )
    OR
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'admin'
    )
);

CREATE POLICY "Trabajadores pueden crear clientes"
ON clientes
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM trabajadores t
        WHERE t.id = clientes.trabajador_id
        AND t.email = auth.jwt() ->> 'email'
    )
    OR
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'admin'
    )
);

CREATE POLICY "Trabajadores pueden actualizar sus clientes"
ON clientes
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM trabajadores t
        WHERE t.id = clientes.trabajador_id
        AND t.email = auth.jwt() ->> 'email'
    )
    OR
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM trabajadores t
        WHERE t.id = clientes.trabajador_id
        AND t.email = auth.jwt() ->> 'email'
    )
    OR
    EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'admin'
    )
); 