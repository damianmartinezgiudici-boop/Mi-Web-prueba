// Reglas puras (sin red ni base de datos) para poder probarlas aparte.

const PREFIJOS: [string, string][] = [
  ['598', 'UY'], ['595', 'PY'], ['591', 'BO'], ['593', 'EC'],
  ['54', 'AR'], ['56', 'CL'], ['57', 'CO'], ['52', 'MX'], ['51', 'PE'], ['58', 'VE'], ['34', 'ES'],
  ['1', 'US'],
];

/** País por el código del teléfono (+598 → UY, +54 → AR). */
export function paisPorTelefono(tel?: string | null): string | null {
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
export function capitalCalifica(respuesta: string | null | undefined, minimo: number): boolean {
  if (!respuesta) return false;
  const r = respuesta.toLowerCase();
  if (/menos de|no tengo|sin capital/.test(r)) return false;
  const ns = montos(r);
  return ns.length > 0 && Math.max(...ns) >= minimo;
}

export const PREGUNTA_CAPITAL = /capital|cu[aá]nto cont[aá]s|invertir|inversi[oó]n/i;
const PREGUNTA_TELEFONO = /whats|tel[eé]fono|celular|n[uú]mero/i;

type QA = { question: string; answer: string };

/** Convierte el invitado de Calendly en una fila de `agendas` (sin tocar resultado ni notas). */
export function agendaDesdeCalendly(invitado: any, evento: any, minimo: number) {
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
export async function firmaCalendlyValida(header: string | null, cuerpo: string, clave: string,
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
export function gastoDesdeMeta(fila: any) {
  const conv = (fila.actions ?? []).find((a: any) => a.action_type === CONVERSACION);
  return {
    fecha: fila.date_start,
    pais: fila.country ?? 'OTRO',
    gasto: Number(fila.spend ?? 0),
    conversaciones: conv ? Number(conv.value) : 0,
  };
}
