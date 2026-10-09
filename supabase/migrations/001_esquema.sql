-- =====================================================================
--  Competencias · esquema y permisos (Supabase / Postgres)
--  Pégalo completo en Supabase → SQL Editor → Run.  Se puede re-ejecutar.
--
--  Jerarquía:
--    admin    carga clases, crea usuarios, entrega clases a decanos
--    decano   ve SOLO las clases que el admin le entregó y SOLO sus maestros;
--             entrega esas clases a sus maestros
--    maestro  ve SOLO las clases que su decano (o el admin) le asignó
--  Todo se aplica en el servidor con Row Level Security: aunque alguien
--  manipule el navegador, la base de datos no le entrega lo que no le toca.
-- =====================================================================

do $$ begin
  create type public.rol as enum ('admin','decano','maestro');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  usuario    text not null unique,
  nombre     text not null default '',
  rol        public.rol not null default 'maestro',
  decano_id  uuid references public.profiles(id) on delete set null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clases (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  grupo      text not null default '',
  periodo    text not null default '',
  color      text not null default '#0a84ff',
  metrics    text[] not null,
  archivo    text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.clase_decanos (
  clase_id  uuid not null references public.clases(id) on delete cascade,
  decano_id uuid not null references public.profiles(id) on delete cascade,
  primary key (clase_id, decano_id)
);

create table if not exists public.clase_maestros (
  clase_id     uuid not null references public.clases(id) on delete cascade,
  maestro_id   uuid not null references public.profiles(id) on delete cascade,
  asignado_por uuid references public.profiles(id) on delete set null,
  primary key (clase_id, maestro_id)
);

create table if not exists public.resultados (
  id        uuid primary key default gen_random_uuid(),
  clase_id  uuid not null references public.clases(id) on delete cascade,
  nombre    text not null,
  matricula text not null default '',
  carrera   text not null default '',
  grupo     text not null default '',
  valores   real[] not null
);
create index if not exists resultados_clase_idx on public.resultados(clase_id);
create index if not exists clase_maestros_maestro_idx on public.clase_maestros(maestro_id);
create index if not exists clase_decanos_decano_idx on public.clase_decanos(decano_id);
create index if not exists profiles_decano_idx on public.profiles(decano_id);

create table if not exists public.carreras (
  codigo text primary key,
  nombre text not null default ''
);

-- Listado institucional de estudiantes (ADM535): solo lo ve el administrador
create table if not exists public.roster (
  id        uuid primary key default gen_random_uuid(),
  matricula text not null default '',
  nombre    text not null,
  carrera   text not null default '',
  grupo     text not null default ''
);

-- ---------------------------------------------------------------------
--  Funciones de apoyo (security definer: evitan recursión en las políticas)
-- ---------------------------------------------------------------------
create or replace function public.my_rol() returns public.rol
language sql stable security definer set search_path = public as $$
  select rol from public.profiles where id = auth.uid() and activo
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_rol() = 'admin', false)
$$;

create or replace function public.my_decano() returns uuid
language sql stable security definer set search_path = public as $$
  select decano_id from public.profiles where id = auth.uid()
$$;

create or replace function public.decano_owns_clase(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_rol() = 'decano', false)
     and exists (select 1 from public.clase_decanos where clase_id = cid and decano_id = auth.uid())
$$;

create or replace function public.can_see_clase(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.decano_owns_clase(cid)
      or (coalesce(public.my_rol() = 'maestro', false)
          and exists (select 1 from public.clase_maestros where clase_id = cid and maestro_id = auth.uid()))
$$;

create or replace function public.is_my_maestro(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_rol() = 'decano', false)
     and exists (select 1 from public.profiles where id = uid and decano_id = auth.uid() and rol = 'maestro')
$$;

-- ---------------------------------------------------------------------
--  Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.clases         enable row level security;
alter table public.clase_decanos  enable row level security;
alter table public.clase_maestros enable row level security;
alter table public.resultados     enable row level security;
alter table public.carreras       enable row level security;
alter table public.roster         enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('profiles','clases','clase_decanos','clase_maestros','resultados','carreras','roster')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- profiles: yo, mi decano, (decano) mis maestros, (admin) todos
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.is_admin()
  or (coalesce(public.my_rol() = 'decano', false) and decano_id = auth.uid())
  or id = public.my_decano()
);
create policy profiles_admin_write on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());
-- un decano puede renombrar / activar / desactivar a SUS maestros, sin cambiarles el rol ni el dueño
create policy profiles_decano_update on public.profiles for update
  using (public.is_my_maestro(id))
  with check (rol = 'maestro' and decano_id = auth.uid());

-- clases y resultados: lectura según jerarquía, escritura solo admin
create policy clases_select on public.clases for select using (public.can_see_clase(id));
create policy clases_admin  on public.clases for all using (public.is_admin()) with check (public.is_admin());

create policy resultados_select on public.resultados for select using (public.can_see_clase(clase_id));
create policy resultados_admin  on public.resultados for all using (public.is_admin()) with check (public.is_admin());

-- clase ↔ decano: lo decide el admin
create policy cd_select on public.clase_decanos for select using (public.is_admin() or decano_id = auth.uid());
create policy cd_admin  on public.clase_decanos for all using (public.is_admin()) with check (public.is_admin());

-- clase ↔ maestro: admin, o el decano dueño de la clase con uno de SUS maestros
create policy cm_select on public.clase_maestros for select using (
  public.is_admin() or maestro_id = auth.uid() or public.decano_owns_clase(clase_id)
);
create policy cm_insert on public.clase_maestros for insert with check (
  public.is_admin() or (public.decano_owns_clase(clase_id) and public.is_my_maestro(maestro_id))
);
create policy cm_delete on public.clase_maestros for delete using (
  public.is_admin() or public.decano_owns_clase(clase_id)
);

create policy carreras_select on public.carreras for select using (auth.uid() is not null);
create policy carreras_admin  on public.carreras for all using (public.is_admin()) with check (public.is_admin());

create policy roster_admin on public.roster for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
--  Perfil automático al crear un usuario de Auth.
--  El PRIMER usuario que exista se vuelve administrador (arranque).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 1;
begin
  base := lower(split_part(new.email, '@', 1));
  candidate := base;
  while exists (select 1 from public.profiles where usuario = candidate) loop
    n := n + 1; candidate := base || n;
  end loop;
  insert into public.profiles (id, usuario, nombre, rol)
  values (
    new.id, candidate,
    coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), candidate),
    case when exists (select 1 from public.profiles) then 'maestro'::public.rol else 'admin'::public.rol end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
--  RPC atómicas
-- ---------------------------------------------------------------------
-- Importa una clase completa con sus resultados y sus decanos (solo admin)
create or replace function public.import_clase(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare cid uuid;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede importar clases'; end if;
  insert into public.clases (nombre, grupo, periodo, color, metrics, archivo, created_by)
  values (p->>'nombre', coalesce(p->>'grupo',''), coalesce(p->>'periodo',''), coalesce(p->>'color','#0a84ff'),
          array(select jsonb_array_elements_text(p->'metrics')), p->>'archivo', auth.uid())
  returning id into cid;

  insert into public.resultados (clase_id, nombre, matricula, carrera, grupo, valores)
  select cid, e->>'nombre', coalesce(e->>'matricula',''), coalesce(e->>'carrera',''), coalesce(e->>'grupo',''),
         array(select v::real from jsonb_array_elements_text(e->'valores') v)
  from jsonb_array_elements(p->'estudiantes') e;

  insert into public.clase_decanos (clase_id, decano_id)
  select cid, d::uuid from jsonb_array_elements_text(coalesce(p->'decanos','[]'::jsonb)) d;
  return cid;
end $$;

-- Reemplaza los resultados de una clase existente (Excel editado y vuelto a subir).
-- Conserva el nombre, el color y quién tiene acceso (solo admin)
create or replace function public.replace_resultados(p_clase uuid, p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede reemplazar datos'; end if;
  update public.clases set metrics = array(select jsonb_array_elements_text(p->'metrics')),
    archivo = coalesce(p->>'archivo', archivo) where id = p_clase;
  delete from public.resultados where clase_id = p_clase;
  insert into public.resultados (clase_id, nombre, matricula, carrera, grupo, valores)
  select p_clase, e->>'nombre', coalesce(e->>'matricula',''), coalesce(e->>'carrera',''), coalesce(e->>'grupo',''),
         array(select v::real from jsonb_array_elements_text(e->'valores') v)
  from jsonb_array_elements(p->'estudiantes') e;
end $$;
grant execute on function public.replace_resultados(uuid, jsonb) to authenticated;

-- Reemplaza los decanos de una clase (RLS: solo admin)
create or replace function public.set_clase_decanos(p_clase uuid, p_ids uuid[]) returns void
language plpgsql security invoker set search_path = public as $$
begin
  delete from public.clase_decanos where clase_id = p_clase and not (decano_id = any(p_ids));
  insert into public.clase_decanos (clase_id, decano_id)
  select p_clase, x from unnest(p_ids) x on conflict do nothing;
end $$;

-- Reemplaza los maestros de una clase (RLS: admin, o el decano dueño con sus maestros)
create or replace function public.set_clase_maestros(p_clase uuid, p_ids uuid[]) returns void
language plpgsql security invoker set search_path = public as $$
begin
  delete from public.clase_maestros where clase_id = p_clase and not (maestro_id = any(p_ids));
  insert into public.clase_maestros (clase_id, maestro_id, asignado_por)
  select p_clase, x, auth.uid() from unnest(p_ids) x on conflict do nothing;
end $$;

grant execute on function public.import_clase(jsonb) to authenticated;
grant execute on function public.set_clase_decanos(uuid, uuid[]) to authenticated;
grant execute on function public.set_clase_maestros(uuid, uuid[]) to authenticated;
