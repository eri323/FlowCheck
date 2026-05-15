-- =====================================================================
-- AI Testing Platform — Realtime (Fase 5)
-- =====================================================================
-- Añade test_runs, test_cases y test_steps a la publication de Supabase
-- Realtime para que el frontend reciba cambios en vivo via WebSocket.
-- =====================================================================

alter publication supabase_realtime add table public.test_runs;
alter publication supabase_realtime add table public.test_cases;
alter publication supabase_realtime add table public.test_steps;
