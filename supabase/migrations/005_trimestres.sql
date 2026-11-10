-- =====================================================================
--  005 · Trimestres: tiempo de cada trimestre (informe «itimespent») e historial
--        de desempeño por trimestre (un punto por cada informe «igrades» importado)
--  Pégalo en Supabase → SQL Editor → Run.  Se puede re-ejecutar.
--  Solo AGREGA columnas; no cambia los datos existentes.
--  Sin esta migración la app funciona igual, pero no guarda el detalle por trimestre.
-- =====================================================================

alter table public.desempeno         add column if not exists tiempos jsonb;
alter table public.desempeno_equipos add column if not exists tiempos jsonb;
alter table public.desempeno         add column if not exists historial jsonb;
alter table public.desempeno_equipos add column if not exists historial jsonb;

create or replace function public.replace_desempeno(p_clase uuid, p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede importar el desempeño'; end if;
  delete from public.desempeno where clase_id = p_clase;
  delete from public.desempeno_equipos where clase_id = p_clase;
  insert into public.desempeno (clase_id, resultado_id, nombre, email, equipo, trimestres, bsc_acum, bsc, minutos, puntaje, puntaje_ajustado, tiempos, historial)
  select p_clase, nullif(j->>'resultado_id','')::uuid, j->>'nombre', coalesce(j->>'email',''), coalesce(j->>'equipo',''),
         (j->>'trimestres')::real, (j->>'bsc_acum')::real, (j->>'bsc')::real, (j->>'minutos')::real, (j->>'puntaje')::real, (j->>'puntaje_ajustado')::real,
         case when jsonb_typeof(j->'tiempos') = 'array' then j->'tiempos' end,
         case when jsonb_typeof(j->'historial') = 'array' then j->'historial' end
  from jsonb_array_elements(coalesce(p->'jugadores','[]'::jsonb)) j;
  insert into public.desempeno_equipos (clase_id, equipo, trimestres, bsc_acum, bsc, minutos, percentil, puntaje, tiempos, historial)
  select p_clase, e->>'equipo', (e->>'trimestres')::real, (e->>'bsc_acum')::real, (e->>'bsc')::real, (e->>'minutos')::real, (e->>'percentil')::real, (e->>'puntaje')::real,
         case when jsonb_typeof(e->'tiempos') = 'array' then e->'tiempos' end,
         case when jsonb_typeof(e->'historial') = 'array' then e->'historial' end
  from jsonb_array_elements(coalesce(p->'equipos','[]'::jsonb)) e
  on conflict (clase_id, equipo) do nothing;
end $$;
grant execute on function public.replace_desempeno(uuid, jsonb) to authenticated;
