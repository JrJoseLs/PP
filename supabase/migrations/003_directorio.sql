-- =====================================================================
--  003 · Directorio de estudiantes y equipos del juego
--  Pégalo en Supabase → SQL Editor → Run.  Se puede re-ejecutar.
--  Solo AGREGA columnas y funciones: no borra ni cambia datos existentes.
-- =====================================================================

-- Directorio (antes "listado"): se completa con cualquier archivo de estudiantes
alter table public.roster add column if not exists email      text not null default '';
alter table public.roster add column if not exists equipo     text not null default '';
alter table public.roster add column if not exists licencia   text not null default '';
alter table public.roster add column if not exists updated_at timestamptz not null default now();

-- Equipo del juego de cada resultado (columna "Empresa" / "Team" del informe)
alter table public.resultados add column if not exists equipo text not null default '';

-- Importar una clase: ahora también guarda el equipo
create or replace function public.import_clase(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare cid uuid;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede importar clases'; end if;
  insert into public.clases (nombre, grupo, periodo, color, metrics, archivo, created_by)
  values (p->>'nombre', coalesce(p->>'grupo',''), coalesce(p->>'periodo',''), coalesce(p->>'color','#0a84ff'),
          array(select jsonb_array_elements_text(p->'metrics')), p->>'archivo', auth.uid())
  returning id into cid;

  insert into public.resultados (clase_id, nombre, matricula, carrera, grupo, equipo, valores)
  select cid, e->>'nombre', coalesce(e->>'matricula',''), coalesce(e->>'carrera',''), coalesce(e->>'grupo',''),
         coalesce(e->>'equipo',''), array(select v::real from jsonb_array_elements_text(e->'valores') v)
  from jsonb_array_elements(p->'estudiantes') e;

  insert into public.clase_decanos (clase_id, decano_id)
  select cid, d::uuid from jsonb_array_elements_text(coalesce(p->'decanos','[]'::jsonb)) d;
  return cid;
end $$;

create or replace function public.replace_resultados(p_clase uuid, p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede reemplazar datos'; end if;
  update public.clases set metrics = array(select jsonb_array_elements_text(p->'metrics')),
    archivo = coalesce(p->>'archivo', archivo) where id = p_clase;
  delete from public.resultados where clase_id = p_clase;
  insert into public.resultados (clase_id, nombre, matricula, carrera, grupo, equipo, valores)
  select p_clase, e->>'nombre', coalesce(e->>'matricula',''), coalesce(e->>'carrera',''), coalesce(e->>'grupo',''),
         coalesce(e->>'equipo',''), array(select v::real from jsonb_array_elements_text(e->'valores') v)
  from jsonb_array_elements(p->'estudiantes') e;
end $$;

-- Reemplaza el directorio completo en una sola operación (solo admin)
create or replace function public.replace_roster(p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede editar el directorio'; end if;
  delete from public.roster where true;
  insert into public.roster (matricula, nombre, carrera, grupo, email, equipo, licencia)
  select coalesce(e->>'matricula',''), e->>'nombre', coalesce(e->>'carrera',''), coalesce(e->>'grupo',''),
         coalesce(e->>'email',''), coalesce(e->>'equipo',''), coalesce(e->>'licencia','')
  from jsonb_array_elements(p) e where coalesce(e->>'nombre','') <> '';
end $$;

-- Completa matrícula / carrera / grupo / equipo de resultados ya cargados (solo admin)
create or replace function public.sync_resultados(p jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede actualizar resultados'; end if;
  update public.resultados r set
    matricula = coalesce(e->>'matricula', r.matricula),
    carrera   = coalesce(e->>'carrera',   r.carrera),
    grupo     = coalesce(e->>'grupo',     r.grupo),
    equipo    = coalesce(e->>'equipo',    r.equipo)
  from jsonb_array_elements(p) e
  where r.id = (e->>'id')::uuid;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.import_clase(jsonb) to authenticated;
grant execute on function public.replace_resultados(uuid, jsonb) to authenticated;
grant execute on function public.replace_roster(jsonb) to authenticated;
grant execute on function public.sync_resultados(jsonb) to authenticated;
