// Acceso a Supabase. Todas las pantallas pasan por acá.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw new Error(error.message);
  return data;
}

async function fn(nombre, cuerpo) {
  const { data, error } = await sb.functions.invoke(nombre, { body: cuerpo });
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null);
    throw new Error(detalle?.error ?? error.message);
  }
  return data;
}

export const demo = false;

export async function usuarioActual() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export function alCambiarSesion(cb) {
  sb.auth.onAuthStateChange((_e, s) => cb(s?.user ?? null));
}

export const entrar = (email) => q(sb.auth.signInWithOtp({
  email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
}));
export const salir = () => sb.auth.signOut();

export async function cargar(usuario) {
  const perfil = await q(sb.from('perfiles').select('*').eq('id', usuario.id).maybeSingle());
  if (!perfil?.activo) return { perfil: null };
  const esAdmin = perfil.rol === 'admin';
  const [perfiles, config, ofertas, metodos, agendas, leads, ventas, pagos, metaGasto, historico, costosFijos, configPrivada] =
    await Promise.all([
      q(sb.from('perfiles').select('*').order('creado')),
      q(sb.from('config').select('*').single()),
      q(sb.from('ofertas').select('*').order('precio')),
      q(sb.from('metodos_pago').select('*').order('id')),
      q(sb.from('agendas').select('*').order('inicio')),
      q(sb.from('leads').select('*').order('creado', { ascending: false })),
      q(sb.from('ventas').select('*').order('fecha', { ascending: false })),
      q(sb.from('pagos').select('*').order('fecha', { ascending: false })),
      q(sb.from('meta_gasto').select('*')),
      q(sb.from('historico').select('*').order('mes')),
      esAdmin ? q(sb.from('costos_fijos').select('*').order('id')) : [],
      esAdmin ? q(sb.from('config_privada').select('*').single()) : null,
    ]);
  return { perfil, perfiles, config, ofertas, metodos, agendas, leads, ventas, pagos, metaGasto, historico, costosFijos, configPrivada };
}

/** Avisa cuando alguien del equipo carga o cambia algo. */
export function escucharCambios(cb) {
  const canal = sb.channel('panel');
  for (const tabla of ['agendas', 'leads', 'ventas', 'pagos', 'meta_gasto']) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, cb);
  }
  canal.subscribe();
}

export const guardarResultado = (id, cambios) => q(sb.from('agendas').update(cambios).eq('id', id));
export const crearLead = (lead) => q(sb.from('leads').insert(lead));
export const actualizarLead = (id, cambios) => q(sb.from('leads').update(cambios).eq('id', id));

export async function crearVenta({ venta, pago, agendaId }) {
  const v = await q(sb.from('ventas').insert(venta).select().single());
  if (pago) await q(sb.from('pagos').insert({ ...pago, venta_id: v.id }));
  if (agendaId) await q(sb.from('agendas').update({ resultado: 'compro' }).eq('id', agendaId));
  return v;
}

export const crearPago = (pago) => q(sb.from('pagos').insert(pago));
export const revisarPago = (id, estado) => q(sb.from('pagos').update({ estado }).eq('id', id));

export const guardarConfig = (cambios) => q(sb.from('config').update(cambios).eq('id', 1));
export const guardarConfigPrivada = (cambios) => q(sb.from('config_privada').update(cambios).eq('id', 1));
export const guardarFila = (tabla, fila) => q(fila.id ? sb.from(tabla).update(fila).eq('id', fila.id) : sb.from(tabla).insert(fila));
export const borrarFila = (tabla, id) => q(sb.from(tabla).delete().eq('id', id));
export const cambiarRol = (id, rol) => q(sb.from('perfiles').update({ rol }).eq('id', id));

export const equipo = (accion, datos) => fn('equipo', { accion, ...datos });
export const sincronizar = (dias = 3) => fn('sincronizar', { dias });
export const activarAviso = () => fn('sincronizar', { accion: 'activar-aviso' });
