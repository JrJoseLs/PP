-- =====================================================================
--  006 · Cargos de las cuentas
--  Pégalo en Supabase → SQL Editor → Run.  Se puede re-ejecutar
--  (si ya ejecutaste una versión anterior, vuelve a ejecutar esta).
--
--  El cargo es el NOMBRE que se ve (Docente invitado, Investigador…). Los define
--  administración en Ajustes → «Cargos y permisos». El permiso real sigue siendo
--  el nivel de la columna «rol»:
--    admin   → acceso total
--    decano  → gestiona las clases que se le asignan y las reparte a su equipo
--    maestro → ve solo las clases que se le asignan
-- =====================================================================

alter table public.profiles add column if not exists cargo text;

-- cualquier nombre corto: la lista de cargos la decide administración
alter table public.profiles drop constraint if exists profiles_cargo_check;
alter table public.profiles add constraint profiles_cargo_check check (
  cargo is null or char_length(btrim(cargo)) between 1 and 60
);

-- las cuentas que ya existen toman el cargo de su nivel
update public.profiles set cargo = 'Administración' where rol = 'admin' and cargo is null;
update public.profiles set cargo = 'Director/Coordinador académico' where rol = 'decano' and cargo is null;
update public.profiles set cargo = 'Docente' where rol = 'maestro' and cargo is null;
