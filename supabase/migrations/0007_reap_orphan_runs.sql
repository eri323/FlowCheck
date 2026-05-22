-- =====================================================================
-- Reaper de runs huérfanos vía pg_cron (independiente del worker)
-- =====================================================================
-- Problema: el worker marca un run como "corriendo" antes de ejecutar
-- Playwright. Si el proceso del worker muere a mitad (OOM en el free tier
-- de Render, spin-down, etc.) nunca escribe un estado final y el run queda
-- congelado en "corriendo" para siempre.
--
-- El barrido en `worker/sweep-orphan-runs.ts` (STALE_MINUTES=10) cubre este
-- caso, PERO solo corre al arrancar el worker. En Render free tier el worker
-- duerme tras ~15 min de inactividad, así que sin tráfico el barrido nunca
-- se dispara y el run sigue "corriendo" durante horas.
--
-- Esta migración añade un reaper a nivel de base de datos que NO depende de
-- que el worker (ni Vercel) estén despiertos: pg_cron corre el mismo barrido
-- cada 5 minutos. Espeja la lógica de sweep-orphan-runs.ts (mismo umbral de
-- 10 minutos sobre created_at, mismos estados de origen).
--
-- Para correr esta migración: pegar este archivo en el SQL Editor del
-- proyecto en Supabase y ejecutarlo (requiere el rol postgres).
-- =====================================================================

-- 1. Habilitar pg_cron (idempotente). En Supabase crea el schema `cron`.
create extension if not exists pg_cron;

-- 2. Reprogramar de forma idempotente: si el job ya existe, lo quitamos antes
--    de volver a crearlo, para que re-ejecutar la migración no falle ni
--    duplique el schedule.
select cron.unschedule('reap-orphan-runs')
where exists (select 1 from cron.job where jobname = 'reap-orphan-runs');

-- 3. Cada 5 minutos: marcar como "fallido" cualquier run que lleve más de
--    10 minutos en "pendiente"/"corriendo". El máximo de vida legítima de un
--    run es ~4 min (90s generación + 120s ejecución + overhead), así que
--    10 min deja margen de sobra y nunca reapará un run sano en curso.
select cron.schedule(
  'reap-orphan-runs',
  '*/5 * * * *',
  $$
    update public.test_runs
       set status = 'fallido',
           error_message = 'Run interrumpido: el worker no escribió un estado final (limpiado por el reaper).',
           finished_at = now()
     where status in ('pendiente', 'corriendo')
       and created_at < now() - interval '10 minutes'
  $$
);
