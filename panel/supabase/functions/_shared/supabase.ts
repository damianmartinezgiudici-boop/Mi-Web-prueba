import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

/** Cliente con clave de servicio: solo vive en el servidor, nunca en el navegador. */
export function servicio(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });
}

/** Devuelve el perfil de quien llama si es admin activo; si no, null. */
export async function adminQueLlama(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const db = servicio();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data } = await db.from('perfiles').select('*').eq('id', user.id).eq('activo', true).eq('rol', 'admin').maybeSingle();
  return data;
}

export const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('PANEL_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
