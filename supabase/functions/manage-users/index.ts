// Edge Function: gestión de cuentas (crear, cambiar contraseña, eliminar).
// Crear usuarios de Auth requiere la llave de servicio, que NUNCA va al navegador:
// por eso vive aquí, en el servidor de Supabase.
//
// Reglas:
//   admin   → puede todo
//   decano  → solo crea / gestiona maestros que le pertenecen (decano_id = él)
//
// Despliegue:  supabase functions deploy manage-users --no-verify-jwt
//   (o desde el panel: Edge Functions → Deploy a new function → Via Editor).
//   La sesión se valida aquí dentro con auth.getUser, por eso "Verify JWT" va apagado.
//   El nombre de la función debe coincidir con USERS_FN en src/data/supabaseApi.ts.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Rol = "admin" | "decano" | "maestro";
const ROLES: Rol[] = ["admin", "decano", "maestro"];
const toEmail = (u: string) => (u.includes("@") ? u : `${u}@pp.local`).trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Llave de servicio: la clásica, o la nueva "secret key" en proyectos recientes
    let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!serviceKey) {
      try { serviceKey = Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"))[0] as string ?? ""; } catch { /* */ }
    }
    if (!serviceKey) return json({ error: "La función no tiene acceso a la llave de servicio" }, 500);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
      auth: { persistSession: false },
    });
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
    if (whoErr || !who.user) return json({ error: "Sesión no válida" }, 401);

    const { data: caller } = await admin.from("profiles").select("*").eq("id", who.user.id).single();
    if (!caller || !caller.activo || caller.rol === "maestro") return json({ error: "Sin permiso" }, 403);
    const isAdmin = caller.rol === "admin";

    const body = await req.json();
    const target = async (id: string) => {
      const { data } = await admin.from("profiles").select("*").eq("id", id).single();
      if (!data) throw new Error("Usuario no encontrado");
      if (!isAdmin && !(data.rol === "maestro" && data.decano_id === caller.id)) throw new Error("Sin permiso sobre ese usuario");
      return data;
    };

    switch (body.action) {
      case "create": {
        const usuario = String(body.usuario ?? "").trim().toLowerCase();
        const password = String(body.password ?? "");
        const nombre = String(body.nombre ?? "").trim() || usuario;
        let rol: Rol = ROLES.includes(body.rol) ? body.rol : "maestro";
        let decano_id: string | null = body.decano_id ?? null;
        if (!/^[a-z0-9._@-]{3,}$/.test(usuario)) return json({ error: "Usuario inválido (mín. 3: letras, números, . _ -)" }, 400);
        if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
        if (!isAdmin) { rol = "maestro"; decano_id = caller.id; }
        if (rol !== "maestro") decano_id = null;

        const { data, error } = await admin.auth.admin.createUser({
          email: toEmail(usuario), password, email_confirm: true, user_metadata: { nombre },
        });
        if (error) return json({ error: error.message.includes("already") ? "Ese usuario ya existe" : error.message }, 400);
        const { data: prof, error: pErr } = await admin.from("profiles")
          .update({ nombre, rol, decano_id, usuario: usuario.split("@")[0] })
          .eq("id", data.user.id).select().single();
        if (pErr) return json({ error: pErr.message }, 400);
        return json({ profile: prof });
      }
      case "set_password": {
        const t = await target(body.id);
        if (String(body.password ?? "").length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
        const { error } = await admin.auth.admin.updateUserById(t.id, { password: body.password });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "delete": {
        const t = await target(body.id);
        if (t.id === caller.id) return json({ error: "No puedes eliminar tu propia cuenta" }, 400);
        const { error } = await admin.auth.admin.deleteUser(t.id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      default:
        return json({ error: "Acción desconocida" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
