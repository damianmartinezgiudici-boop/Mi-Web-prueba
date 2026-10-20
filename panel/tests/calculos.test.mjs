import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesDe, mesAnterior, resumenMes, serie, embudoInverso, saldos, ganancia } from '../web/calculos.js';

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
