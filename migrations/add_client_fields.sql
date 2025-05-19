-- Agregar nuevos campos a la tabla clientes
ALTER TABLE clientes
ADD COLUMN telefono_familiar VARCHAR(20),
ADD COLUMN comprobante_domicilio_url TEXT,
ADD COLUMN ine_url TEXT;

-- Crear bucket de almacenamiento para documentos si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Crear políticas de seguridad para el bucket de documentos
CREATE POLICY "Los trabajadores pueden subir documentos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documentos' AND
    (auth.jwt() ->> 'role' = 'trabajador' OR auth.jwt() ->> 'role' = 'admin')
);

CREATE POLICY "Los trabajadores pueden ver documentos"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documentos' AND
    (auth.jwt() ->> 'role' = 'trabajador' OR auth.jwt() ->> 'role' = 'admin')
); 