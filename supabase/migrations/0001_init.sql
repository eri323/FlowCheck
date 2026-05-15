-- =====================================================================
-- AI Testing Platform — Migración inicial (Fase 1)
-- =====================================================================
-- Crea las tablas profiles, projects, test_runs, test_cases, test_steps
-- con sus relaciones, políticas RLS por user_id y un trigger que crea
-- el profile automáticamente cuando se registra un usuario en auth.users.
-- Para correr esta migración: pegar este archivo completo en el
-- SQL Editor del proyecto en Supabase y ejecutarlo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------
create type public.user_plan as enum ('free', 'pro');
create type public.user_role as enum ('user', 'admin');

create type public.run_status as enum (
  'pendiente',
  'corriendo',
  'completado',
  'fallido',
  'cancelado'
);

create type public.step_status as enum (
  'pendiente',
  'corriendo',
  'passed',
  'failed',
  'skipped'
);

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  plan public.user_plan not null default 'free',
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  target_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id);

-- ---------------------------------------------------------------------
-- test_runs
-- ---------------------------------------------------------------------
create table public.test_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  target_url text not null,
  prompt text not null,
  status public.run_status not null default 'pendiente',
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index test_runs_user_id_idx on public.test_runs (user_id);
create index test_runs_project_id_idx on public.test_runs (project_id);
create index test_runs_created_at_idx on public.test_runs (created_at desc);

-- ---------------------------------------------------------------------
-- test_cases
-- ---------------------------------------------------------------------
create table public.test_cases (
  id uuid primary key default gen_random_uuid(),
  test_run_id uuid not null references public.test_runs (id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  status public.run_status not null default 'pendiente',
  created_at timestamptz not null default now()
);

create index test_cases_test_run_id_idx on public.test_cases (test_run_id);

-- ---------------------------------------------------------------------
-- test_steps
-- ---------------------------------------------------------------------
create table public.test_steps (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid not null references public.test_cases (id) on delete cascade,
  position integer not null default 0,
  action text not null,
  selector text,
  value text,
  status public.step_status not null default 'pendiente',
  error_message text,
  screenshot_url text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index test_steps_test_case_id_idx on public.test_steps (test_case_id);

-- ---------------------------------------------------------------------
-- Trigger: mantener updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Trigger: crear profile al registrar un usuario en auth.users
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.test_runs enable row level security;
alter table public.test_cases enable row level security;
alter table public.test_steps enable row level security;

-- profiles: el usuario solo lee/edita su propio profile
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- projects: scoped por user_id
create policy projects_select_own on public.projects
  for select using (auth.uid() = user_id);

create policy projects_insert_own on public.projects
  for insert with check (auth.uid() = user_id);

create policy projects_update_own on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy projects_delete_own on public.projects
  for delete using (auth.uid() = user_id);

-- test_runs: scoped por user_id
create policy test_runs_select_own on public.test_runs
  for select using (auth.uid() = user_id);

create policy test_runs_insert_own on public.test_runs
  for insert with check (auth.uid() = user_id);

create policy test_runs_update_own on public.test_runs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy test_runs_delete_own on public.test_runs
  for delete using (auth.uid() = user_id);

-- test_cases: heredan permisos a través del test_run dueño
create policy test_cases_select_own on public.test_cases
  for select using (
    exists (
      select 1 from public.test_runs r
      where r.id = test_cases.test_run_id and r.user_id = auth.uid()
    )
  );

create policy test_cases_modify_own on public.test_cases
  for all using (
    exists (
      select 1 from public.test_runs r
      where r.id = test_cases.test_run_id and r.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.test_runs r
      where r.id = test_cases.test_run_id and r.user_id = auth.uid()
    )
  );

-- test_steps: heredan permisos a través del test_case → test_run dueño
create policy test_steps_select_own on public.test_steps
  for select using (
    exists (
      select 1
      from public.test_cases c
      join public.test_runs r on r.id = c.test_run_id
      where c.id = test_steps.test_case_id and r.user_id = auth.uid()
    )
  );

create policy test_steps_modify_own on public.test_steps
  for all using (
    exists (
      select 1
      from public.test_cases c
      join public.test_runs r on r.id = c.test_run_id
      where c.id = test_steps.test_case_id and r.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.test_cases c
      join public.test_runs r on r.id = c.test_run_id
      where c.id = test_steps.test_case_id and r.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Storage bucket: screenshots (público para lectura)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', true)
on conflict (id) do nothing;

create policy "screenshots_public_read" on storage.objects
  for select using (bucket_id = 'screenshots');

create policy "screenshots_authenticated_insert" on storage.objects
  for insert with check (
    bucket_id = 'screenshots' and auth.role() = 'authenticated'
  );
