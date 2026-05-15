-- =====================================================================
-- Fase 2 — Tipos de prueba estructurados
-- =====================================================================
-- Añade soporte para tipos de prueba con campos dinámicos: login,
-- registro, búsqueda, navegación, formulario y e-commerce. Los datos
-- sensibles (credenciales, tarjetas) viven en test_data jsonb, separados
-- de la instrucción de texto libre. La columna prompt pasa a opcional.
-- =====================================================================

create type public.test_type as enum (
  'login',
  'registro',
  'busqueda',
  'navegacion',
  'formulario',
  'ecommerce'
);

alter table public.test_runs
  add column test_type public.test_type not null default 'navegacion',
  add column test_data jsonb not null default '{}'::jsonb;

alter table public.test_runs
  alter column prompt drop not null;

alter table public.test_runs
  alter column test_type drop default;

create index test_runs_test_type_idx on public.test_runs (test_type);
