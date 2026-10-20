import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesDe, mesAnterior, resumenMes, serie, embudoInverso, saldos, ganancia, armarTelefono, separarTelefono, resumenAnuncios, sugerencia, ultimos30 } from '../web/calculos.js';

const base = () => ({
  config: { comision_closer_pct: 10 },
  perfiles: [{ id: 'ramiro', rol: 'closer' }, { id: 'pedro', rol: 'socio' }],
  agendas: [
    { id: 'a1', estado: 'activa', inicio: '2026-11-03T21:00:00Z', calificada: true, resultado: 'compro' },
    { id: 'a2', estado: 'activa', inicio: '2026-11-04T21:00:00Z', calificada: true, resultado: 'no_compro' },
    { id: 'a3', estado: 'activa', inicio: '2026-11-05T21:00:00Z', calificada: false, resultado: 'no_se_presento' },
    { id: 'a4', estado: 'activa', inicio: '2026-11-06T21:00:00Z', calificada: true, resultado: 'pendiente' },
    { id: 'a5', estado: 'cancelada', inicio: '2026-11-06T21:00:00Z', calificada: true, resultado: 'pendiente' },
    // 1 de diciembre 01:00 UTC = 30 de noviembre 22:00 en Uruguay
    { id: 'a6', estado: 'activa', inicio: '2026-12-01T01:00:00Z', calificada: true, resultado: 'seguimiento' },
  ],
  ventas: [{ id: 'v1', fecha: '2026-11-03', precio: 1850, pais: 'UY', closer_id: 'ramiro' }],
  pagos: [
    { venta_id: 'v1', fecha: '2026-11-03', monto: 1000, neto: 940, estado: 'recibido' },   // dLocal 6%
    { venta_id: 'v1', fecha: '2026-11-20', monto: 200, neto: 200, estado: 'informado' },
    { venta_id: 'v1', fecha: '2026-11-21', monto: 999, neto: 999, estado: 'rechazado' },
  ],
  metaGasto: [{ fecha: '2026-11-01', pais: 'UY', gasto: 100 }, { fecha: '2026-11-02', pais: 'AR', gasto: 50 }],
  historico: [{ mes: '2026-09-01', cobrado: 33095, gasto_meta: 5204.3, agendas: 73, ventas_uy: 8, ventas_ar: 10 }],
  leads: [{ creado: '2026-11-02T12:00:00Z', estado: 'calificado', setter_id: 'gabo' }],
  ofertas: [], costosFijos: [],
});

test('mes en hora de Uruguay', () => {
  assert.equal(mesDe('2026-12-01T01:00:00Z'), '2026-11');
  assert.equal(mesDe('2026-12-01'), '2026-12');
  assert.equal(mesAnterior('2026-01', 1), '2025-12');
});

test('resumen del mes', () => {
  const r = resumenMes(base(), '2026-11', new Date('2026-11-10T00:00:00Z'));
  assert.equal(r.agendas, 5);                 // sin la cancelada, con la del 30/11 a la noche
  assert.equal(r.calificadas, 4);
  assert.equal(r.hechas, 3);
  assert.equal(r.cierre, 1 / 3);
  assert.equal(r.presentan, 3 / 4);
  assert.equal(r.paraCargar.length, 1);
  assert.equal(r.cobrado, 940);               // lo que entró neto de dLocal
  assert.equal(r.porConfirmar, 200);
  assert.equal(r.gasto, 150);
  assert.equal(r.costoAgendaCalif, 37.5);
  assert.deepEqual(r.comisiones.ramiro, { confirmada: 94, aConfirmar: 20 });  // 10% de lo que entra
  assert.equal(r.totalComisiones, 94);
});

test('serie usa histórico si el mes no tiene datos en vivo', () => {
  const [sep, nov] = serie(base(), ['2026-09', '2026-11']);
  assert.equal(sep.cobrado, 33095);
  assert.equal(Math.round(sep.costoAgenda), 71);
  assert.equal(nov.cobrado, 940);
});

test('embudo inverso para 40K', () => {
  const e = embudoInverso(40000, { ticket: 1530, cierre: 30, presentan: 75, calificadas: 60, leadAgenda: 5, costoAgenda: 35 });
  assert.deepEqual(e, { ventas: 27, llamadas: 90, calificadas: 120, agendas: 200, leads: 4000, inversion: 7000 });
  assert.equal(embudoInverso(40000, { ticket: 1530, cierre: 0, presentan: 75, calificadas: 60, leadAgenda: 5 }), null);
});

test('saldo pendiente por cuotas (rechazados no cuentan)', () => {
  assert.equal(saldos(base())[0].saldo, 650);
});

test('ganancia del CEO', () => {
  const r = resumenMes(base(), '2026-11');
  const g = ganancia(r, [{ monto: 800, activo: true }, { monto: 300, activo: false }]);
  assert.equal(g.neta, 940 - 150 - 94 - 800);
});

test('reparto con el socio y sin comisión para el socio', () => {
  const d = base();
  d.ventas.push({ id: 'v2', fecha: '2026-11-05', precio: 2500, pais: 'AR', closer_id: 'pedro' });
  d.pagos.push({ venta_id: 'v2', fecha: '2026-11-05', monto: 2500, neto: 2500, estado: 'recibido' });
  const r = resumenMes(d, '2026-11');
  assert.equal(r.comisiones.pedro, undefined);
  assert.equal(r.totalComisiones, 94);
  const g = ganancia(r, [], 30);
  assert.equal(g.neta, 3440 - 150 - 94);
  assert.equal(Math.round(g.parteSocio * 100) / 100, 958.8);
  assert.equal(Math.round(g.tuParte * 100) / 100, 2237.2);
  assert.equal(ganancia({ ...r, cobrado: 0 }, [], 30).parteSocio, 0);   // con pérdida no hay reparto
});

test('mes anterior al panel usa el histórico', () => {
  const r = resumenMes(base(), '2026-09');
  assert.equal(r.historico, true);
  assert.equal(r.cobrado, 33095);
  assert.equal(r.ventas, 18);
  assert.equal(r.gasto, 5204.3);
  assert.equal(resumenMes(base(), '2026-11').historico, false);
});

test('mes viejo con agendas traídas de Calendly sigue usando el cobrado y las ventas del histórico', () => {
  const d = base();
  d.agendas.push(
    { id: 's1', estado: 'activa', inicio: '2026-09-10T21:00:00Z', calificada: true, resultado: 'pendiente' },
    { id: 's2', estado: 'activa', inicio: '2026-09-11T21:00:00Z', calificada: false, resultado: 'pendiente' },
  );
  const r = resumenMes(d, '2026-09', new Date('2026-10-19T12:00:00Z'));
  assert.equal(r.historico, true);
  assert.equal(r.cobrado, 33095);
  assert.equal(r.ventas, 18);
  assert.deepEqual(r.ventasPais, { UY: 8, AR: 10 });
  assert.equal(r.agendas, 2);                 // las de Calendly, con su nivel de capital
  assert.equal(r.calificadas, 1);
  const [sep] = serie(d, ['2026-09']);
  assert.equal(sep.cobrado, 33095);
  assert.equal(sep.uy, 8);
  assert.equal(Math.round(sep.costoAgenda), 2602);
});

test('gastos del mes: comisiones aparte y extras, solo en su mes', () => {
  const r = resumenMes(base(), '2026-11');
  const gastos = [
    { fecha: '2026-11-10', tipo: 'comision', monto: 50 },
    { fecha: '2026-11-15', tipo: 'extra', monto: 200 },
    { fecha: '2026-10-31', tipo: 'extra', monto: 999 },   // otro mes: no cuenta
  ];
  const g = ganancia(r, [], 0, gastos);
  assert.equal(g.comisiones, 94 + 50);
  assert.equal(g.extras, 200);
  assert.equal(g.neta, 940 - 150 - 144 - 200);
});

test('setter: 5% de todo lo que entra, la venta la cierre quien la cierre', () => {
  const d = base();
  d.config.comision_setter_pct = 5;
  d.perfiles.push({ id: 'gabo', rol: 'setter' });
  d.ventas.push({ id: 'v2', fecha: '2026-11-05', precio: 2500, pais: 'AR', closer_id: 'pedro' });
  d.pagos.push({ venta_id: 'v2', fecha: '2026-11-05', monto: 2500, neto: 2500, estado: 'recibido' });
  const r = resumenMes(d, '2026-11');
  assert.deepEqual(r.comisiones.gabo, { confirmada: (940 + 2500) * 0.05, aConfirmar: 200 * 0.05 });
  assert.deepEqual(r.comisiones.ramiro, { confirmada: 94, aConfirmar: 20 });   // Ramiro sigue igual
  assert.equal(r.totalComisiones, 94 + 172);
  // Sin el dato cargado en la base, no hay comisión de setter (ni números rotos)
  delete d.config.comision_setter_pct;
  assert.equal(resumenMes(d, '2026-11').comisiones.gabo, undefined);
});

test('una seña cargada en un mes del histórico no pisa el cobrado de ese mes ni genera comisión', () => {
  const d = base();
  d.config.comision_setter_pct = 5;
  d.perfiles.push({ id: 'gabo', rol: 'setter' });
  d.ventas.push({ id: 'v3', fecha: '2026-10-16', precio: 1850, pais: 'AR', closer_id: 'ramiro' });
  d.pagos.push({ venta_id: 'v3', fecha: '2026-09-30', monto: 100, neto: 100, estado: 'recibido' });
  d.pagos.push({ venta_id: 'v3', fecha: '2026-10-16', monto: 800, neto: 800, estado: 'recibido' });
  d.historico.push({ mes: '2026-10-01', cobrado: 0, gasto_meta: 1817.02, agendas: 34, ventas_uy: 0, ventas_ar: 0 });
  const sep = resumenMes(d, '2026-09', new Date('2026-10-20T12:00:00Z'));
  assert.equal(sep.cobrado, 33095);
  assert.equal(sep.ventas, 18);
  assert.deepEqual(sep.comisiones, {});
  const oct = resumenMes(d, '2026-10', new Date('2026-10-20T12:00:00Z'));
  assert.equal(oct.cobrado, 800);
  assert.equal(oct.ventas, 1);
  assert.deepEqual(oct.comisiones.ramiro, { confirmada: 80, aConfirmar: 0 });
  assert.deepEqual(oct.comisiones.gabo, { confirmada: 40, aConfirmar: 0 });
  assert.equal(saldos(d).find((v) => v.id === 'v3').saldo, 950);
});

test('WhatsApp con código de país automático', () => {
  assert.equal(armarTelefono('UY', '099 123 456'), '+598 99123456');
  assert.equal(armarTelefono('AR', '11 2345-6789'), '+54 91123456789');   // agrega el 9 de celular
  assert.equal(armarTelefono('AR', '9 11 2345 6789'), '+54 91123456789');
  assert.equal(armarTelefono('UY', '  '), null);
  assert.deepEqual(separarTelefono('+598 99123456'), { pais: 'UY', numero: '99123456' });
  assert.deepEqual(separarTelefono('+595 981 123456'), { pais: 'PY', numero: '981123456' });
  assert.deepEqual(separarTelefono(null), { pais: null, numero: '' });
});

test('anuncios: de qué anuncio vino cada agenda y cada venta', () => {
  const d = base();
  d.anuncios = [{ id: '111', nombre: 'Video A', campana: 'EVG-UY' }, { id: '222', nombre: 'Web B', campana: 'EVG-Web' }];
  d.metaAnuncios = [
    { fecha: '2026-11-02', anuncio_id: '111', gasto: 100, conversaciones: 20, clics: 0 },
    { fecha: '2026-11-03', anuncio_id: '111', gasto: 50, conversaciones: 10, clics: 0 },
    { fecha: '2026-11-03', anuncio_id: '222', gasto: 30, conversaciones: 0, clics: 12 },
    { fecha: '2026-10-30', anuncio_id: '222', gasto: 999, conversaciones: 0, clics: 0 },   // otro mes
  ];
  // a1 compró: llegó por WhatsApp y Gabo marcó el anuncio en el lead (se une por el WhatsApp).
  d.agendas[0].telefono = '+598 99 123 456';
  d.leads.push({ creado: '2026-11-01T12:00:00Z', estado: 'agendado', setter_id: 'gabo', telefono: '+598 99123456', anuncio_id: '111' });
  d.ventas[0].agenda_id = 'a1';
  // a2 vino de la web: el link de Calendly trajo el anuncio en el UTM.
  d.agendas[1].anuncio_id = '222';
  const r = resumenAnuncios(d, '2026-11');
  const [a, b] = r.anuncios;
  assert.equal(a.id, '111');
  assert.deepEqual([a.gasto, a.conversaciones, a.leads, a.agendas, a.ventas, a.vendido], [150, 30, 1, 1, 1, 1850]);
  assert.equal(a.porConversacion, 5);
  assert.equal(Math.round(a.retorno * 100) / 100, 12.33);
  assert.deepEqual([b.gasto, b.clics, b.agendas, b.ventas, b.porVenta], [30, 12, 1, 0, null]);
  assert.deepEqual([r.agendas, r.agendasConAnuncio, r.ventas, r.ventasConAnuncio], [5, 2, 1, 1]);
  assert.equal(sugerencia(a, 35), 'escalar');
  assert.equal(sugerencia(b, 35), 'datos');
  assert.equal(sugerencia({ ...b, gasto: 200, agendas: 0 }, 35), 'revisar');
  assert.equal(sugerencia({ ...b, gasto: 200, agendas: 5, porAgenda: 40 }, 35), 'mantener');
});

test('anuncios: últimos 30 días', () => {
  assert.deepEqual(ultimos30('2026-11', new Date('2026-11-14T15:00:00Z')), { desde: '2026-10-16', hasta: '2026-11-14' });
  assert.deepEqual(ultimos30('2026-10', new Date('2026-11-14T15:00:00Z')), { desde: '2026-10-02', hasta: '2026-10-31' });
  const d = base();
  d.anuncios = [{ id: '111', nombre: 'Video A' }];
  d.metaAnuncios = [{ fecha: '2026-10-20', anuncio_id: '111', gasto: 10, conversaciones: 1, clics: 0 },
                    { fecha: '2026-11-10', anuncio_id: '111', gasto: 5, conversaciones: 1, clics: 0 },
                    { fecha: '2026-09-01', anuncio_id: '111', gasto: 99, conversaciones: 1, clics: 0 }];
  assert.equal(resumenAnuncios(d, { desde: '2026-10-16', hasta: '2026-11-14' }).anuncios[0].gasto, 15);
});
