-- =====================================================================
--  006 · Cargos de las cuentas
--  Pégalo en Supabase → SQL Editor → Run.  Se puede re-ejecutar.
--  Solo AGREGA una columna; los permisos no cambian:
--    admin   → Administración
--    decano  → Director/Coordinador académico
--    maestro → Docente · Docente invitado · Facilitador/Mentor · Investigador
--              (los cuatro ven solo las clases que se les asignan)
-- =====================================================================

alter table public.profiles add column if not exists cargo text;

alter table public.profiles drop constraint if exists profiles_cargo_check;
alter table public.profiles add constraint profiles_cargo_check check (
  cargo is null
  or (rol = 'admin'   and cargo = 'Administración')
  or (rol = 'decano'  and cargo = 'Director/Coordinador académico')
  or (rol = 'maestro' and cargo in ('Docente', 'Docente invitado', 'Facilitador/Mentor', 'Investigador'))
);

-- las cuentas que ya existen toman el cargo de su nivel
update public.profiles set cargo = 'Director/Coordinador académico' where rol = 'decano' and cargo is null;
update public.profiles set cargo = 'Docente' where rol = 'maestro' and cargo is null;
