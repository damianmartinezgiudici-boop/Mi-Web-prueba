// Generado por scripts/empaquetar.mjs a partir de supabase/functions/equipo. No editar a mano.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

// ── supabase.ts ──

/** Cliente con clave de servicio: solo vive en el servidor, nunca en el navegador. */
function servicio(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });
}

/** Devuelve el perfil de quien llama si es admin activo; si no, null. */
async function adminQueLlama(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const db = servicio();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data } = await db.from('perfiles').select('*').eq('id', user.id).eq('activo', true).eq('rol', 'admin').maybeSingle();
  return data;
}

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('PANEL_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ── equipo ──
// Alta y baja del equipo. Solo el admin puede usarla.

const ROLES = ['admin', 'socio', 'closer', 'setter'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const admin = await adminQueLlama(req);
  if (!admin) return json({ error: 'Solo el admin puede gestionar el equipo' }, 403);

  const { accion, email, nombre, rol, id } = await req.json();
  const db = servicio();

  if (accion === 'invitar') {
    if (!email || !ROLES.includes(rol)) return json({ error: 'Falta el mail o el rol' }, 400);
    const { data, error } = await db.auth.admin.inviteUserByEmail(String(email).trim().toLowerCase(),
      { redirectTo: Deno.env.get('PANEL_URL') });
    if (error) return json({ error: error.message }, 400);
    const { error: e2 } = await db.from('perfiles').upsert({
      id: data.user.id, email: data.user.email, nombre: nombre ?? '', rol, activo: true,
    });
    if (e2) return json({ error: e2.message }, 400);
    return json({ ok: true });
  }

  if (accion === 'quitar' || accion === 'reactivar') {
    const { data: perfil } = await db.from('perfiles').select('dueno').eq('id', id).single();
    if (!perfil) return json({ error: 'No existe' }, 404);
    if (perfil.dueno) return json({ error: 'Al dueño no se le puede quitar el acceso' }, 400);
    const activo = accion === 'reactivar';
    await db.auth.admin.updateUserById(id, { ban_duration: activo ? 'none' : '876000h' });
    const { error } = await db.from('perfiles').update({ activo }).eq('id', id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Acción desconocida' }, 400);
});
