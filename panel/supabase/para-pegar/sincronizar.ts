// Generado por scripts/empaquetar.mjs a partir de supabase/functions/sincronizar. No editar a mano.
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

// ── logica.ts ──
// Reglas puras (sin red ni base de datos) para poder probarlas aparte.

const PREFIJOS: [string, string][] = [
  ['598', 'UY'], ['595', 'PY'], ['591', 'BO'], ['593', 'EC'],
  ['54', 'AR'], ['56', 'CL'], ['57', 'CO'], ['52', 'MX'], ['51', 'PE'], ['58', 'VE'], ['34', 'ES'],
  ['1', 'US'],
];

/** País por el código del teléfono (+598 → UY, +54 → AR). */
function paisPorTelefono(tel?: string | null): string | null {
  if (!tel) return null;
  const limpio = tel.replace(/[^\d+]/g, '');
  if (!limpio.startsWith('+') && !limpio.startsWith('00')) {
    // Número local sin código: los de Uruguay empiezan con 09 y tienen 9 dígitos.
    return /^09\d{7}$/.test(limpio) ? 'UY' : null;
  }
  const digitos = limpio.replace(/^\+|^00/, '');
  for (const [prefijo, pais] of PREFIJOS) if (digitos.startsWith(prefijo)) return pais;
  return 'OTRO';
}

/** "USD 1.500" → 1500, "1,5k" → 1500, "3000" → 3000. */
function montos(texto: string): number[] {
  const out: number[] = [];
  for (const m of texto.toLowerCase().matchAll(/(\d+(?:[.,]\d+)*)\s*(k)?/g)) {
    let s = m[1];
    if (m[2]) s = s.replace(',', '.');                 // 1,5k
    else s = s.replace(/[.,](?=\d{3}\b)/g, '');        // 1.500 / 1,500
    const n = parseFloat(s.replace(',', '.')) * (m[2] ? 1000 : 1);
    if (!isNaN(n)) out.push(n);
  }
  return out;
}

type Nivel = 'califica' | 'medio' | 'no';

/**
 * Nivel de capital declarado:
 *  - 'no': no tiene capital.
 *  - 'medio': tiene algo pero menos del mínimo (ej. "al menos $500", "menos de USD 1.500"): puede entrar con seña.
 *  - 'califica': puede alcanzar el mínimo (programa + USD 500 de producto). En un rango cuenta el tope.
 */
function nivelCapital(respuesta: string | null | undefined, minimo: number): Nivel {
  if (!respuesta) return 'no';
  const r = respuesta.toLowerCase();
  if (/no tengo|sin capital|ning[uú]n|nada/.test(r)) return 'no';
  const ns = montos(r);
  if (!ns.length) return 'no';
  if (/menos de/.test(r)) return 'medio';
  return Math.max(...ns) >= minimo ? 'califica' : 'medio';
}

function capitalCalifica(respuesta: string | null | undefined, minimo: number): boolean {
  return nivelCapital(respuesta, minimo) === 'califica';
}

const PREGUNTA_CAPITAL = /cu[aá]nto[\s\S]*(invertir|cont[aá]s)|capital/i;
const PREGUNTA_TELEFONO = /whats|tel[eé]fono|celular|n[uú]mero/i;

type QA = { question: string; answer: string };

/** Convierte el invitado de Calendly en una fila de `agendas` (sin tocar resultado ni notas). */
function agendaDesdeCalendly(invitado: any, evento: any, minimo: number) {
  const qa: QA[] = invitado.questions_and_answers ?? [];
  const capital = qa.find((q) => PREGUNTA_CAPITAL.test(q.question))?.answer ?? null;
  const telefono = invitado.text_reminder_number
    ?? qa.find((q) => PREGUNTA_TELEFONO.test(q.question))?.answer
    ?? null;
  return {
    id: String(invitado.uri).split('/').pop()!,
    evento_id: String(evento.uri).split('/').pop()!,
    nombre: invitado.name ?? '',
    email: invitado.email ?? null,
    telefono,
    pais: paisPorTelefono(telefono),
    capital,
    nivel: nivelCapital(capital, minimo),
    calificada: capitalCalifica(capital, minimo),
    inicio: evento.start_time,
    estado: invitado.status === 'canceled' || evento.status === 'canceled' ? 'cancelada' : 'activa',
  };
}

/** Firma de los webhooks de Calendly: header "t=<ts>,v1=<hmac>" sobre "<ts>.<body>". */
async function firmaCalendlyValida(header: string | null, cuerpo: string, clave: string,
                                          ahora = Date.now()): Promise<boolean> {
  if (!header) return false;
  const partes = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  if (!partes.t || !partes.v1) return false;
  if (Math.abs(ahora / 1000 - Number(partes.t)) > 300) return false;   // máx. 5 minutos
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${partes.t}.${cuerpo}`));
  const hex = [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== partes.v1.length) return false;
  let dif = 0;
  for (let i = 0; i < hex.length; i++) dif |= hex.charCodeAt(i) ^ partes.v1.charCodeAt(i);
  return dif === 0;
}

const CONVERSACION = 'onsite_conversion.messaging_conversation_started_7d';

/** Fila de insights de Meta (nivel cuenta, por país y día) → fila de `meta_gasto`. */
function gastoDesdeMeta(fila: any) {
  const conv = (fila.actions ?? []).find((a: any) => a.action_type === CONVERSACION);
  return {
    fecha: fila.date_start,
    pais: fila.country ?? 'OTRO',
    gasto: Number(fila.spend ?? 0),
    conversaciones: conv ? Number(conv.value) : 0,
  };
}

// ── sincronizar ──
// Corre cada hora (cron) o desde el botón "Actualizar" del admin.
// Trae el gasto de Meta por país y día, y repasa las agendas de Calendly por si se perdió algún aviso.

const META = 'https://graph.facebook.com/v21.0';
const CAL = 'https://api.calendly.com';

const dia = (d: Date) => d.toISOString().slice(0, 10);

async function sincronizarMeta(db: ReturnType<typeof servicio>, desde: string, hasta: string) {
  const token = Deno.env.get('META_TOKEN'), cuenta = Deno.env.get('META_ACCOUNT_ID');
  if (!token || !cuenta) return 'Meta sin configurar';
  const filas: any[] = [];
  let url: string | null = `${META}/act_${cuenta}/insights?` + new URLSearchParams({
    level: 'account', breakdowns: 'country', time_increment: '1', limit: '500',
    time_range: JSON.stringify({ since: desde, until: hasta }),
    fields: 'spend,actions', access_token: token,
  });
  while (url) {
    const r: Response = await fetch(url);
    const j: any = await r.json();
    if (!r.ok) throw new Error('Meta: ' + (j.error?.message ?? r.status));
    filas.push(...j.data.map(gastoDesdeMeta));
    url = j.paging?.next ?? null;
  }
  if (filas.length) {
    const { error } = await db.from('meta_gasto').upsert(filas);
    if (error) throw error;
  }
  return `${filas.length} filas de Meta`;
}

async function cal(path: string, token: string) {
  const r = await fetch(path.startsWith('http') ? path : CAL + path, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok) throw new Error('Calendly: ' + (j.message ?? r.status));
  return j;
}

async function sincronizarCalendly(db: ReturnType<typeof servicio>, desde: Date, forzar = false) {
  const token = Deno.env.get('CALENDLY_TOKEN');
  if (!token) return 'Calendly sin configurar';
  const tipo = Deno.env.get('CALENDLY_EVENT_TYPE');
  const yo = (await cal('/users/me', token)).resource.uri;
  const { data: config } = await db.from('config').select('capital_minimo').single();
  const minimo = Number(config?.capital_minimo ?? 1500);

  const eventos: any[] = [];
  let url: string | null = '/scheduled_events?' + new URLSearchParams({
    user: yo, min_start_time: desde.toISOString(), count: '100', sort: 'start_time:asc',
  });
  while (url) {
    const j: any = await cal(url, token);
    eventos.push(...j.collection.filter((e: any) => !tipo || String(e.event_type).endsWith(tipo)));
    url = j.pagination?.next_page ?? null;
  }

  // Solo se piden los invitados de eventos nuevos o que cambiaron de estado.
  const ids = eventos.map((e) => String(e.uri).split('/').pop());
  const { data: conocidas } = await db.from('agendas').select('evento_id, estado').in('evento_id', ids);
  const estado = new Map((conocidas ?? []).map((a) => [a.evento_id, a.estado]));
  let n = 0;
  for (const e of eventos) {
    const id = String(e.uri).split('/').pop();
    const esperado = e.status === 'canceled' ? 'cancelada' : 'activa';
    if (!forzar && estado.get(id) === esperado) continue;
    const inv = await cal(`${e.uri}/invitees?count=100`, token);
    const filas = inv.collection.map((i: any) => agendaDesdeCalendly(i, e, minimo));
    if (filas.length) {
      const { error } = await db.from('agendas').upsert(filas);
      if (error) throw error;
      n += filas.length;
    }
  }
  return `${eventos.length} eventos de Calendly, ${n} agendas actualizadas`;
}

/** Registra el aviso (webhook) de Calendly hacia la función calendly-webhook. Si ya existe, no hace nada. */
async function activarAvisoCalendly() {
  const token = Deno.env.get('CALENDLY_TOKEN'), clave = Deno.env.get('CALENDLY_SIGNING_KEY');
  if (!token || !clave) return 'Faltan CALENDLY_TOKEN o CALENDLY_SIGNING_KEY';
  const yo = (await cal('/users/me', token)).resource;
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendly-webhook`;
  const existentes = await cal('/webhook_subscriptions?' + new URLSearchParams({
    organization: yo.current_organization, user: yo.uri, scope: 'user',
  }), token);
  if (existentes.collection.some((w: any) => w.callback_url === url && w.state === 'active')) return 'El aviso ya estaba activo';
  const r = await fetch(CAL + '/webhook_subscriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, events: ['invitee.created', 'invitee.canceled'], organization: yo.current_organization,
      user: yo.uri, scope: 'user', signing_key: clave }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Calendly: ' + (j.message ?? r.status));
  return 'Aviso de Calendly activado';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const porCron = req.headers.get('x-clave') === Deno.env.get('SINCRONIZAR_CLAVE');
  if (!porCron && !(await adminQueLlama(req))) return json({ error: 'sin permiso' }, 403);

  const params = await req.json().catch(() => ({}));
  if (params.accion === 'activar-aviso') {
    try { return json({ calendly: await activarAvisoCalendly() }); }
    catch (e) { return json({ error: (e as Error).message }, 400); }
  }
  const dias = Math.min(Number(params.dias ?? 3), 400);
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - dias * 86400000);
  const db = servicio();
  const resultado: Record<string, string> = {};
  for (const [nombre, tarea] of [
    ['meta', () => sincronizarMeta(db, dia(desde), dia(hoy))],
    ['calendly', () => sincronizarCalendly(db, desde, !!params.forzar)],
  ] as const) {
    try { resultado[nombre] = await tarea(); }
    catch (e) { resultado[nombre] = 'ERROR: ' + (e as Error).message; }
  }
  return json(resultado);
});
