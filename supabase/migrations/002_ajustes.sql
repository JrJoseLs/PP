-- =====================================================================
--  002 · Ajustes de la plataforma (nombres de roles y de competencias)
--  Pégalo en Supabase → SQL Editor → Run.  Se puede re-ejecutar.
--  No cambia ninguna tabla existente ni los permisos.
-- =====================================================================

create table if not exists public.ajustes (
  clave      text primary key,
  valor      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ajustes enable row level security;

drop policy if exists ajustes_select on public.ajustes;
drop policy if exists ajustes_admin  on public.ajustes;

-- cualquiera con sesión lee los nombres; solo administración los cambia
create policy ajustes_select on public.ajustes for select using (auth.uid() is not null);
create policy ajustes_admin  on public.ajustes for all using (public.is_admin()) with check (public.is_admin());
