-- =====================================================================
--  004 · Desempeño en el juego (informe «igrades» de Marketplace)
--  Pégalo en Supabase → SQL Editor → Run.  Se puede re-ejecutar.
--  Solo AGREGA tablas y funciones; no cambia los datos existentes.
--
--  desempeno          una fila por jugador: su tiempo, puntaje y el Scorecard de su equipo
--  desempeno_equipos  una fila por equipo: Scorecard acumulado y del trimestre, tiempo, percentil
--  Mismos permisos que los resultados: lo ve quien ve la clase; solo administración escribe.
-- =====================================================================

create table if not exists public.desempeno (
  id               uuid primary key default gen_random_uuid(),
  clase_id         uuid not null references public.clases(id) on delete cascade,
  resultado_id     uuid references public.resultados(id) on delete set null,
  nombre           text not null,
  email            text not null default '',
  equipo           text not null default '',
  trimestres       real,
  bsc_acum         real,          -- Balanced Scorecard acumulado (del equipo)
  bsc              real,          -- Balanced Scorecard del último trimestre (del equipo)
  minutos          real,          -- tiempo propio del jugador
  puntaje          real,          -- puntuación calculada automáticamente
  puntaje_ajustado real           -- puntaje ajustado por el instructor
);
create index if not exists desempeno_clase_idx on public.desempeno(clase_id);

create table if not exists public.desempeno_equipos (
  clase_id   uuid not null references public.clases(id) on delete cascade,
  equipo     text not null,
  trimestres real,
  bsc_acum   real,
  bsc        real,
  minutos    real,               -- tiempo total del equipo
  percentil  real,
  puntaje    real,
  primary key (clase_id, equipo)
);

alter table public.desempeno         enable row level security;
alter table public.desempeno_equipos enable row level security;

drop policy if exists desempeno_select on public.desempeno;
drop policy if exists desempeno_admin  on public.desempeno;
drop policy if exists deseq_select     on public.desempeno_equipos;
drop policy if exists deseq_admin      on public.desempeno_equipos;
create policy desempeno_select on public.desempeno for select using (public.can_see_clase(clase_id));
create policy desempeno_admin  on public.desempeno for all using (public.is_admin()) with check (public.is_admin());
create policy deseq_select on public.desempeno_equipos for select using (public.can_see_clase(clase_id));
create policy deseq_admin  on public.desempeno_equipos for all using (public.is_admin()) with check (public.is_admin());

-- Sustituye el desempeño de una clase en una sola operación (solo admin)
create or replace function public.replace_desempeno(p_clase uuid, p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede importar el desempeño'; end if;
  delete from public.desempeno where clase_id = p_clase;
  delete from public.desempeno_equipos where clase_id = p_clase;
  insert into public.desempeno (clase_id, resultado_id, nombre, email, equipo, trimestres, bsc_acum, bsc, minutos, puntaje, puntaje_ajustado)
  select p_clase, nullif(j->>'resultado_id','')::uuid, j->>'nombre', coalesce(j->>'email',''), coalesce(j->>'equipo',''),
         (j->>'trimestres')::real, (j->>'bsc_acum')::real, (j->>'bsc')::real, (j->>'minutos')::real, (j->>'puntaje')::real, (j->>'puntaje_ajustado')::real
  from jsonb_array_elements(coalesce(p->'jugadores','[]'::jsonb)) j;
  insert into public.desempeno_equipos (clase_id, equipo, trimestres, bsc_acum, bsc, minutos, percentil, puntaje)
  select p_clase, e->>'equipo', (e->>'trimestres')::real, (e->>'bsc_acum')::real, (e->>'bsc')::real, (e->>'minutos')::real, (e->>'percentil')::real, (e->>'puntaje')::real
  from jsonb_array_elements(coalesce(p->'equipos','[]'::jsonb)) e
  on conflict (clase_id, equipo) do nothing;
end $$;
grant execute on function public.replace_desempeno(uuid, jsonb) to authenticated;
