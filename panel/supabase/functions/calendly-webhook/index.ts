// Recibe cada agenda nueva o cancelada de Calendly al instante.
import { servicio, json } from '../_shared/supabase.ts';
import { agendaDesdeCalendly, firmaCalendlyValida } from '../_shared/logica.ts';

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
