-- Crear tabla de movimientos
CREATE TABLE IF NOT EXISTS movimientos (
    id BIGSERIAL PRIMARY KEY,
    tipo_movimiento VARCHAR(50) NOT NULL CHECK (tipo_movimiento IN (
        'entrega_cliente',
        'abono_cliente', 
        'pago_multa',
        'pago_acumulado',
        'renovacion_prestamo',
        'liquidacion_prestamo'
    )),
    monto DECIMAL(12, 2) NOT NULL CHECK (monto >= 0),
    fecha DATE NOT NULL,
    usuario_id BIGINT NOT NULL,
    referencia_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo_movimiento ON movimientos(tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_usuario_id ON movimientos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_referencia_id ON movimientos(referencia_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_created_at ON movimientos(created_at);

-- Crear trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_movimientos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_movimientos_updated_at
    BEFORE UPDATE ON movimientos
    FOR EACH ROW
    EXECUTE FUNCTION update_movimientos_updated_at();

-- Habilitar RLS (Row Level Security)
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;

-- Crear políticas de seguridad

-- Los trabajadores y admins pueden crear movimientos
CREATE POLICY "usuarios_can_insert_movimientos" ON movimientos
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        auth.jwt() ->> 'role' = 'trabajador' OR auth.jwt() ->> 'role' = 'admin'
    );

-- Los trabajadores pueden ver sus propios movimientos (validación en aplicación)
CREATE POLICY "trabajadores_can_select_own_movimientos" ON movimientos
    FOR SELECT 
    TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'trabajador'
    );

-- Los administradores pueden ver todos los movimientos
CREATE POLICY "admins_can_select_all_movimientos" ON movimientos
    FOR SELECT 
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'admin');

-- Los administradores pueden actualizar movimientos
CREATE POLICY "admins_can_update_movimientos" ON movimientos
    FOR UPDATE 
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'admin');

-- Los administradores pueden eliminar movimientos
CREATE POLICY "admins_can_delete_movimientos" ON movimientos
    FOR DELETE 
    TO authenticated
    USING (auth.jwt() ->> 'role' = 'admin');

-- Comentarios para documentación
COMMENT ON TABLE movimientos IS 'Registro de todos los movimientos financieros del sistema';
COMMENT ON COLUMN movimientos.tipo_movimiento IS 'Tipo de movimiento: entrega_cliente, abono_cliente, pago_multa, pago_acumulado, renovacion_prestamo, liquidacion_prestamo';
COMMENT ON COLUMN movimientos.monto IS 'Monto del movimiento en pesos mexicanos';
COMMENT ON COLUMN movimientos.fecha IS 'Fecha del movimiento';
COMMENT ON COLUMN movimientos.usuario_id IS 'ID del usuario que realizó el movimiento';
COMMENT ON COLUMN movimientos.referencia_id IS 'ID de referencia (préstamo, multa, etc.) según el tipo de movimiento'; 