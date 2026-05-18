-- =====================================================================
-- Configuración de runner — columnas para navegador, dispositivo,
-- reintentos, conteo de errores JS y stream de logs.
-- Para correr esta migración: pegar este archivo completo en el
-- SQL Editor del proyecto en Supabase y ejecutarlo.
-- =====================================================================

alter table public.test_runs
  add column browser text not null default 'chromium',
  add column device text not null default 'desktop',
  add column retries smallint not null default 1,
  add column js_error_count integer not null default 0,
  add column logs jsonb not null default '[]'::jsonb;

-- Acota los valores admitidos sin usar un enum (más fácil de extender).
alter table public.test_runs
  add constraint test_runs_browser_check
    check (browser in ('chromium', 'firefox', 'webkit')),
  add constraint test_runs_device_check
    check (device in ('desktop', 'mobile')),
  add constraint test_runs_retries_check
    check (retries between 0 and 5);
