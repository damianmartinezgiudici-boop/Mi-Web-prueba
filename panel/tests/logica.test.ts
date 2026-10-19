import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paisPorTelefono, capitalCalifica, agendaDesdeCalendly, firmaCalendlyValida, gastoDesdeMeta }
  from '../supabase/functions/_shared/logica.ts';

test('país por teléfono', () => {
  assert.equal(paisPorTelefono('+598 99 123 456'), 'UY');
  assert.equal(paisPorTelefono('+54 9 11 5555-4444'), 'AR');
  assert.equal(paisPorTelefono('0054 9 11 5555 4444'), 'AR');
  assert.equal(paisPorTelefono('099123456'), 'UY');
  assert.equal(paisPorTelefono('+52 55 1234 5678'), 'MX');
  assert.equal(paisPorTelefono('+44 20 1234'), 'OTRO');
  assert.equal(paisPorTelefono(null), null);
});

test('capital: respuestas nuevas de Calendly', () => {
  assert.equal(capitalCalifica('Más de USD 3.000', 1500), true);
  assert.equal(capitalCalifica('Entre USD 2.000 y 3.000', 1500), true);
  assert.equal(capitalCalifica('Entre USD 1.500 y 2.000', 1500), true);
  assert.equal(capitalCalifica('Menos de USD 1.500', 1500), false);
  assert.equal(capitalCalifica('Hoy no tengo capital', 1500), false);
});

test('capital: respuestas viejas y libres', () => {
  assert.equal(capitalCalifica('Hoy cuento con al menos $500', 1500), false);
  assert.equal(capitalCalifica('tengo 1,5k', 1500), true);
  assert.equal(capitalCalifica('unos 5000 dolares', 1500), true);
  assert.equal(capitalCalifica('', 1500), false);
  assert.equal(capitalCalifica('Puedo invertir entre $1,000 y $2,000 USD para comenzar de forma progresiva.', 1500), true);
  assert.equal(capitalCalifica('Puedo invertir menos de $1,000 USD', 1500), false);
});

test('agenda desde Calendly', () => {
  const a = agendaDesdeCalendly({
    uri: 'https://api.calendly.com/scheduled_events/EV1/invitees/INV1',
    name: 'Lucía', email: 'l@x.com', status: 'active', text_reminder_number: null,
    questions_and_answers: [
      { question: 'Tu WhatsApp', answer: '+598 99 111 222' },
      { question: 'Para arrancar necesitás invertir en el programa + mínimo USD 500 para tu producto. ¿Con cuánto contás hoy?', answer: 'Entre USD 2.000 y 3.000' },
    ],
  }, { uri: 'https://api.calendly.com/scheduled_events/EV1', start_time: '2026-11-13T21:00:00Z', status: 'active' }, 1500);
  assert.deepEqual(a, {
    id: 'INV1', evento_id: 'EV1', nombre: 'Lucía', email: 'l@x.com', telefono: '+598 99 111 222',
    pais: 'UY', capital: 'Entre USD 2.000 y 3.000', calificada: true,
    inicio: '2026-11-13T21:00:00Z', estado: 'activa',
  });
});

test('firma del webhook de Calendly', async () => {
  const body = '{"event":"invitee.created"}', t = 1_800_000_000;
  const v1 = createHmac('sha256', 'clave').update(`${t}.${body}`).digest('hex');
  assert.equal(await firmaCalendlyValida(`t=${t},v1=${v1}`, body, 'clave', t * 1000), true);
  assert.equal(await firmaCalendlyValida(`t=${t},v1=${v1}`, body + ' ', 'clave', t * 1000), false);
  assert.equal(await firmaCalendlyValida(`t=${t},v1=${v1}`, body, 'otra', t * 1000), false);
  assert.equal(await firmaCalendlyValida(`t=${t},v1=${v1}`, body, 'clave', (t + 3600) * 1000), false);
  assert.equal(await firmaCalendlyValida(null, body, 'clave'), false);
});

test('gasto de Meta', () => {
  assert.deepEqual(gastoDesdeMeta({ date_start: '2026-10-01', country: 'UY', spend: '28.56',
    actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '31' }] }),
    { fecha: '2026-10-01', pais: 'UY', gasto: 28.56, conversaciones: 31 });
});
