-- Función para reiniciar abonos diarios
CREATE OR REPLACE FUNCTION reset_daily_abonos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE abonos
    SET abono_diario = 0
    WHERE abono_diario != 0;
    
    -- Notificar por email (esto requeriría configuración adicional de email en Supabase)
    -- Por ahora solo lo registramos en la tabla de logs
    INSERT INTO system_logs (action, details)
    VALUES ('reset_daily_abonos', 'Reiniciado campo abono_diario a 0');
END;
$$;

-- Función para reiniciar abonos semanales
CREATE OR REPLACE FUNCTION reset_weekly_abonos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE abonos
    SET abono_semanal = 0
    WHERE abono_semanal != 0;
    
    INSERT INTO system_logs (action, details)
    VALUES ('reset_weekly_abonos', 'Reiniciado campo abono_semanal a 0');
END;
$$;

-- Función para reiniciar multas diarias
CREATE OR REPLACE FUNCTION reset_daily_multas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE clientes
    SET total_multas_hoy = 0
    WHERE total_multas_hoy != 0;
    
    INSERT INTO system_logs (action, details)
    VALUES ('reset_daily_multas', 'Reiniciado campo total_multas_hoy a 0');
END;
$$;

-- Función para reiniciar multas semanales
CREATE OR REPLACE FUNCTION reset_weekly_multas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE clientes
    SET total_multas_semanales = 0
    WHERE total_multas_semanales != 0;
    
    INSERT INTO system_logs (action, details)
    VALUES ('reset_weekly_multas', 'Reiniciado campo total_multas_semanales a 0');
END;
$$;

-- Crear tabla de logs del sistema si no existe
CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear los cron jobs usando pg_cron
-- Nota: pg_cron debe estar habilitado en tu instancia de Supabase
-- Puedes verificar si está habilitado con: SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Reiniciar abonos diarios a las 5 AM (hora de México)
SELECT cron.schedule(
    'reset-daily-abonos',
    '0 5 * * *',
    $$SELECT reset_daily_abonos()$$
);

-- Reiniciar abonos semanales los lunes a las 5 AM
SELECT cron.schedule(
    'reset-weekly-abonos',
    '0 5 * * 1',
    $$SELECT reset_weekly_abonos()$$
);

-- Reiniciar multas diarias a las 5 AM
SELECT cron.schedule(
    'reset-daily-multas',
    '0 5 * * *',
    $$SELECT reset_daily_multas()$$
);

-- Reiniciar multas semanales los domingos a las 3 AM
SELECT cron.schedule(
    'reset-weekly-multas',
    '0 3 * * 0',
    $$SELECT reset_weekly_multas()$$
);

-- Función para ver los cron jobs programados
CREATE OR REPLACE FUNCTION get_scheduled_jobs()
RETURNS TABLE (
    jobid bigint,
    jobname text,
    schedule text,
    command text,
    active boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT jobid, jobname, schedule, command, active
    FROM cron.job;
$$;

-- Política de seguridad para la tabla de logs
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los administradores pueden ver los logs"
ON system_logs
FOR SELECT
TO authenticated
USING (
    auth.jwt() ->> 'role' = 'admin'
); 