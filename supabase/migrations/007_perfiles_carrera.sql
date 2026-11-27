-- =====================================================================
--  007 · Perfiles por carrera (CRR ponderado) y carreras de cada coordinador
--  Pégalo en Supabase → SQL Editor → Run.  Se puede re-ejecutar.
--  Solo AGREGA tablas y una columna; no cambia los datos existentes.
--
--  perfiles_carrera   un perfil por carrera: 100 puntos repartidos entre las 24 competencias
--  perfiles_cambios   registro de quién cambió cada perfil y cuándo (no se puede editar)
--  profiles.carreras  carreras a cargo de cada coordinador (las asigna administración)
--
--  Permisos: todos leen los perfiles (hacen falta para calcular el CRR);
--  los escribe administración o el coordinador que tiene esa carrera a su cargo.
-- =====================================================================

alter table public.profiles add column if not exists carreras text[] not null default '{}';

create table if not exists public.perfiles_carrera (
  codigo          text primary key check (char_length(codigo) between 1 and 40),
  nombre          text not null default '',
  claves          jsonb not null default '[]'::jsonb,
  pesos           jsonb not null default '{}'::jsonb,
  modo            text not null default 'auto' check (modo in ('auto', 'manual')),
  pct_claves      real not null default 35 check (pct_claves between 0 and 100),
  actualizado_por uuid default auth.uid(),
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.perfiles_cambios (
  id      bigint generated always as identity primary key,
  codigo  text not null,
  accion  text not null,
  antes   jsonb,
  despues jsonb,
  por     uuid default auth.uid(),
  en      timestamptz not null default now()
);

/* ¿Puede la persona actual editar el perfil de esta carrera? */
create or replace function public.can_edit_perfil(cod text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.activo and p.rol = 'decano'
                   and upper(cod) = any (select upper(x) from unnest(p.carreras) x))
$$;

alter table public.perfiles_carrera enable row level security;
alter table public.perfiles_cambios enable row level security;

drop policy if exists perfiles_select on public.perfiles_carrera;
drop policy if exists perfiles_write  on public.perfiles_carrera;
create policy perfiles_select on public.perfiles_carrera for select to authenticated using (true);
create policy perfiles_write  on public.perfiles_carrera for all to authenticated
  using (public.can_edit_perfil(codigo)) with check (public.can_edit_perfil(codigo));

drop policy if exists cambios_select on public.perfiles_cambios;
create policy cambios_select on public.perfiles_cambios for select to authenticated using (public.can_edit_perfil(codigo));

/* Quién y cuándo: se completa solo en cada cambio, y queda registrado */
create or replace function public.perfiles_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.actualizado_por := auth.uid();
    new.actualizado_en := now();
  end if;
  insert into public.perfiles_cambios (codigo, accion, antes, despues, por)
  values (coalesce(new.codigo, old.codigo), lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end, auth.uid());
  return coalesce(new, old);
end $$;
drop trigger if exists perfiles_auditar_trg on public.perfiles_carrera;
create trigger perfiles_auditar_trg before insert or update or delete on public.perfiles_carrera
  for each row execute function public.perfiles_auditar();
