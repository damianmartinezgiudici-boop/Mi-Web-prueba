// Generado por scripts/empaquetar.mjs a partir de supabase/functions/calendly-webhook. No editar a mano.
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

/**
 * Calificada si el capital declarado puede alcanzar el mínimo (programa + USD 500 de producto).
 * En un rango ("entre 1.000 y 2.000") cuenta el tope: esa persona puede llegar al mínimo.
 */
function capitalCalifica(respuesta: string | null | undefined, minimo: number): boolean {
  if (!respuesta) return false;
  const r = respuesta.toLowerCase();
  if (/menos de|no tengo|sin capital/.test(r)) return false;
  const ns = montos(r);
  return ns.length > 0 && Math.max(...ns) >= minimo;
}

const PREGUNTA_CAPITAL = /capital|cu[aá]nto cont[aá]s|invertir|inversi[oó]n/i;
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

// ── calendly-webhook ──
// Recibe cada agenda nueva o cancelada de Calendly al instante.

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método' }, 405);
  const cuerpo = await req.text();
  const ok = await firmaCalendlyValida(req.headers.get('Calendly-Webhook-Signature'), cuerpo,
    Deno.env.get('CALENDLY_SIGNING_KEY')!);
  if (!ok) return json({ error: 'firma inválida' }, 401);

  const { event, payload } = JSON.parse(cuerpo);
  if (event !== 'invitee.created' && event !== 'invitee.canceled') return json({ ignorado: event });

  const evento = payload.scheduled_event;
  const tipo = Deno.env.get('CALENDLY_EVENT_TYPE');
  if (tipo && !String(evento.event_type).endsWith(tipo)) return json({ ignorado: 'otro tipo de evento' });

  const db = servicio();
  const { data: config } = await db.from('config').select('capital_minimo').single();
  const fila = agendaDesdeCalendly(payload, evento, Number(config?.capital_minimo ?? 1500));
  if (event === 'invitee.canceled') fila.estado = 'cancelada';
  const { error } = await db.from('agendas').upsert(fila);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: fila.id });
});
