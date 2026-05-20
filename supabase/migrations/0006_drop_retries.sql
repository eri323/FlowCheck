-- =====================================================================
-- Elimina la configuración de reintentos. La cola BullMQ que aplicaba los
-- reintentos a nivel de job fue retirada del proyecto, así que la columna
-- ya no tiene uso. DROP COLUMN elimina también el constraint
-- test_runs_retries_check creado en 0005_runner_config.sql.
-- Para correr esta migración: pegar este archivo en el SQL Editor del
-- proyecto en Supabase y ejecutarlo.
-- =====================================================================

alter table public.test_runs
  drop column retries;
