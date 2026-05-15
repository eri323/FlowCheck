-- =====================================================================
-- Fase 2 — GRANTs explícitos para los roles de Supabase
-- =====================================================================
-- Las policies RLS por sí solas no bastan: el rol authenticated necesita
-- GRANT a nivel de tabla. Sin esto, cualquier INSERT/SELECT desde el
-- cliente devuelve "permission denied for table ...".
-- service_role bypasea RLS pero igual necesita los grants.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, update on public.profiles to authenticated;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.test_runs to authenticated;
grant select, insert, update, delete on public.test_cases to authenticated;
grant select, insert, update, delete on public.test_steps to authenticated;

grant all on public.profiles to service_role;
grant all on public.projects to service_role;
grant all on public.test_runs to service_role;
grant all on public.test_cases to service_role;
grant all on public.test_steps to service_role;

-- Defaults para futuras tablas creadas en este schema
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
