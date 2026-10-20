import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paisPorTelefono, capitalCalifica, nivelCapital, agendaDesdeCalendly, firmaCalendlyValida, gastoDesdeMeta, anuncioDesdeMeta, anuncioDeUtm, estadoAnuncio }
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

test('nivel de capital: rojo, amarillo, verde', () => {
  assert.equal(nivelCapital('Hoy no tengo capital', 1500), 'no');
  assert.equal(nivelCapital('', 1500), 'no');
  assert.equal(nivelCapital('Hoy cuento con al menos $500', 1500), 'medio');
  assert.equal(nivelCapital('Menos de USD 1.500', 1500), 'medio');
  assert.equal(nivelCapital('Puedo invertir menos de $1,000 USD', 1500), 'medio');
  assert.equal(nivelCapital('Puedo invertir entre $1,000 y $2,000 USD', 1500), 'califica');
  assert.equal(nivelCapital('Más de USD 3.000', 1500), 'califica');
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
    pais: 'UY', capital: 'Entre USD 2.000 y 3.000', nivel: 'califica', calificada: true,
    inicio: '2026-11-13T21:00:00Z', estado: 'activa', anuncio_id: null,
  });
});

test('agenda real: la pregunta de capital no se confunde con la de intentos previos', () => {
  const a = agendaDesdeCalendly({
    uri: 'x/invitees/I2', name: 'Ignacio Torre', email: 'i@x.com', status: 'active', text_reminder_number: '+54 9 11 4946-0961',
    questions_and_answers: [
      { question: '¿Qué te ha impedido lograrlo hasta ahora y qué intentos o métodos probaste?\n(Ej: inversiones tradicionales, intentos con otros negocios, cursos, falta de tiempo, falta de guía, etc.)', answer: 'Inversiones tradicionales, cursos, negocios inmobiliarios.' },
      { question: 'En caso de que podamos ayudarte.  ¿Cuánto estarías dispuesto a invertir en poder crear y hacer crecer un negocio en Amazon FBA?', answer: 'Puedo invertir entre $1,000 y $2,000 USD para comenzar de forma progresiva.' },
    ],
  }, { uri: 'x/E2', start_time: '2026-10-19T18:30:00Z', status: 'active' }, 1500);
  assert.equal(a.capital, 'Puedo invertir entre $1,000 y $2,000 USD para comenzar de forma progresiva.');
  assert.equal(a.calificada, true);
  assert.equal(a.pais, 'AR');
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

test('anuncios: fila de Meta por anuncio y UTM de Calendly', () => {
  const { anuncio, dia } = anuncioDesdeMeta({ ad_id: '120210000000001', ad_name: 'Video Rama', campaign_name: 'EVG-AR', date_start: '2026-11-14',
    spend: '12.5', inline_link_clicks: '3', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '9' }] });
  assert.deepEqual(anuncio, { id: '120210000000001', nombre: 'Video Rama', campana: 'EVG-AR' });
  assert.deepEqual(dia, { fecha: '2026-11-14', anuncio_id: '120210000000001', gasto: 12.5, conversaciones: 9, clics: 3 });
  assert.equal(anuncioDeUtm('120210000000001'), '120210000000001');
  assert.equal(anuncioDeUtm('{{ad.id}}'), null);          // parámetro mal armado en Meta
  assert.equal(anuncioDeUtm('historia-ig'), null);
  assert.equal(anuncioDeUtm(undefined), null);
  const fila = agendaDesdeCalendly({ uri: 'x/inv1', name: 'A', tracking: { utm_content: '120210000000001' } },
    { uri: 'x/ev1', start_time: '2026-11-15T15:00:00Z', status: 'active' }, 1000);
  assert.equal(fila.anuncio_id, '120210000000001');
});

test('estado del anuncio en palabras', () => {
  assert.equal(estadoAnuncio('ACTIVE'), 'activo');
  assert.equal(estadoAnuncio('CAMPAIGN_PAUSED'), 'pausado');
  assert.equal(estadoAnuncio('ADSET_PAUSED'), 'pausado');
  assert.equal(estadoAnuncio('PENDING_REVIEW'), 'en revisión');
  assert.equal(estadoAnuncio(null), null);
});
