// Alta y baja del equipo. Solo el admin puede usarla.
import { servicio, adminQueLlama, json, CORS } from '../_shared/supabase.ts';

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
