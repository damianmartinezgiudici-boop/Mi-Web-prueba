// Cálculos del panel. Funciones puras: reciben los datos y devuelven números.

export const ZONA = 'America/Montevideo';

const fmtMes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit' });

/** '2026-11' para una fecha ISO, en hora de Uruguay. Las fechas 'YYYY-MM-DD' se toman tal cual. */
export function mesDe(fecha) {
  if (!fecha) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha.slice(0, 7);
  return fmtMes.format(new Date(fecha)).slice(0, 7);
}

export function mesAnterior(mes, n = 1) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

export const HECHAS = ['no_compro', 'seguimiento', 'compro'];

const suma = (xs, f) => xs.reduce((t, x) => t + Number(f(x) || 0), 0);

/** Todo lo que pasó en un mes. */
export function resumenMes(d, mes, ahora = new Date()) {
  const agendas = d.agendas.filter((a) => a.estado === 'activa' && mesDe(a.inicio) === mes);
  const calificadas = agendas.filter((a) => a.calificada);
  const medio = agendas.filter((a) => a.nivel === 'medio');
  const hechas = agendas.filter((a) => HECHAS.includes(a.resultado));
  const compraron = agendas.filter((a) => a.resultado === 'compro');
  const noShow = agendas.filter((a) => a.resultado === 'no_se_presento');
  const paraCargar = agendas.filter((a) => a.resultado === 'pendiente' && new Date(a.inicio) < ahora);

  const ventas = d.ventas.filter((v) => mesDe(v.fecha) === mes);
  const pagos = d.pagos.filter((p) => mesDe(p.fecha) === mes);
  const recibidos = pagos.filter((p) => p.estado === 'recibido');
  const informados = pagos.filter((p) => p.estado === 'informado');

  const gastoFilas = d.metaGasto.filter((g) => mesDe(g.fecha) === mes);
  const hist = d.historico.find((h) => mesDe(h.mes) === mes);
  const gasto = gastoFilas.length ? suma(gastoFilas, (g) => g.gasto) : Number(hist?.gasto_meta ?? 0);
  const gastoPais = (p) => suma(gastoFilas.filter((g) => g.pais === p), (g) => g.gasto);

  // Meses anteriores al panel: si el histórico tiene el dato, manda él (ya está cerrado y pagado);
  // si no lo tiene, se usa lo cargado. Las agendas pueden venir de Calendly aunque el mes sea viejo.
  const usaHistCobros = !!hist && (Number(hist.cobrado) > 0 || !pagos.length);
  const usaHistVentas = !!hist && (hist.ventas_uy + hist.ventas_ar > 0 || !ventas.length);

  // Closer: % de lo que entra de sus ventas. Setter: % de todo lo que entra.
  // Ni el admin ni el socio cobran comisión.
  const pct = Number(d.config.comision_closer_pct) / 100;
  const pctSetter = (Number(d.config.comision_setter_pct) || 0) / 100;
  const setters = pctSetter ? d.perfiles.filter((p) => p.rol === 'setter').map((p) => p.id) : [];
  const esCloser = new Set(d.perfiles.filter((p) => p.rol === 'closer').map((p) => p.id));
  const ventaPorId = new Map(d.ventas.map((v) => [v.id, v]));
  const comisiones = {};
  for (const p of usaHistCobros ? [] : pagos) {   // en meses del histórico no se recalculan comisiones
    if (p.estado === 'rechazado') continue;
    const estado = p.estado === 'recibido' ? 'confirmada' : 'aConfirmar';
    const sumar = (id, porc) => { comisiones[id] ??= { confirmada: 0, aConfirmar: 0 }; comisiones[id][estado] += Number(p.neto) * porc; };
    const closer = ventaPorId.get(p.venta_id)?.closer_id;
    if (esCloser.has(closer)) sumar(closer, pct);
    for (const s of setters) sumar(s, pctSetter);
  }

  const leads = d.leads.filter((l) => mesDe(l.creado) === mes);

  const historico = usaHistCobros && usaHistVentas && mes < mesDe(ahora.toISOString());

  return {
    historico,
    mes,
    agendas: agendas.length || (hist ? Number(hist.agendas) : 0),
    calificadas: calificadas.length,
    medio: medio.length,
    hechas: hechas.length,
    compraron: compraron.length,
    noShow: noShow.length,
    paraCargar,
    cierre: hechas.length ? compraron.length / hechas.length : null,
    presentan: (hechas.length + noShow.length) ? hechas.length / (hechas.length + noShow.length) : null,
    ventas: usaHistVentas ? hist.ventas_uy + hist.ventas_ar : ventas.length,
    vendido: usaHistVentas ? Number(hist.cobrado) : suma(ventas, (v) => v.precio),
    ventasPais: usaHistVentas
      ? { UY: hist.ventas_uy, AR: hist.ventas_ar }
      : { UY: ventas.filter((v) => v.pais === 'UY').length, AR: ventas.filter((v) => v.pais === 'AR').length },
    cobrado: usaHistCobros ? Number(hist.cobrado) : suma(recibidos, (p) => p.neto),
    porConfirmar: usaHistCobros ? 0 : suma(informados, (p) => p.neto),
    gasto,
    gastoPais: { UY: gastoPais('UY'), AR: gastoPais('AR') },
    costoAgendaCalif: calificadas.length ? gasto / calificadas.length : null,
    comisiones,
    totalComisiones: suma(Object.values(comisiones), (c) => c.confirmada),
    leads: leads.length,
    leadsCalificados: leads.filter((l) => l.estado === 'calificado' || l.estado === 'agendado').length,
    leadsPorSetter: leads.reduce((m, l) => ((m[l.setter_id] = (m[l.setter_id] ?? 0) + 1), m), {}),
  };
}

/** Series mensuales para los gráficos (el histórico ya viene mezclado en resumenMes). */
export function serie(d, meses) {
  return meses.map((mes) => {
    const r = resumenMes(d, mes);
    return { mes, cobrado: r.cobrado, gasto: r.gasto, agendas: r.agendas, uy: r.ventasPais.UY, ar: r.ventasPais.AR,
      costoAgenda: r.agendas ? r.gasto / r.agendas : null };
  });
}

/** Embudo hacia atrás: cuánto hace falta de cada paso para llegar a la meta. */
export function embudoInverso(meta, s) {
  const p = (x) => Number(x) / 100;
  if (!(s.ticket > 0) || !(p(s.cierre) > 0) || !(p(s.presentan) > 0) || !(p(s.calificadas) > 0) || !(p(s.leadAgenda) > 0)) return null;
  const ventas = Math.ceil(meta / s.ticket);
  const llamadas = Math.ceil(ventas / p(s.cierre));
  const calificadas = Math.ceil(llamadas / p(s.presentan));
  const agendas = Math.ceil(calificadas / p(s.calificadas));
  const leads = Math.ceil(agendas / p(s.leadAgenda));
  const inversion = agendas * Number(s.costoAgenda || 0);
  return { ventas, llamadas, calificadas, agendas, leads, inversion };
}

/** Ticket promedio de las ventas cargadas; si no hay, el promedio de las ofertas. */
export function ticketPromedio(d) {
  if (d.ventas.length) return suma(d.ventas, (v) => v.precio) / d.ventas.length;
  const activas = d.ofertas.filter((o) => o.activa);
  return activas.length ? suma(activas, (o) => o.precio) / activas.length : 0;
}

/** Lo que vendió cada venta y cuánto falta cobrar. */
export function saldos(d) {
  return d.ventas.map((v) => {
    const pagado = suma(d.pagos.filter((p) => p.venta_id === v.id && p.estado !== 'rechazado'), (p) => p.monto);
    return { ...v, pagado, saldo: Math.max(0, Number(v.precio) - pagado) };
  });
}

/** Bloque del CEO: ganancia del mes y reparto con el socio. */
export function ganancia(r, costosFijos, socioPct = 0, gastos = []) {
  const fijos = suma(costosFijos.filter((c) => c.activo), (c) => c.monto);
  const delMes = gastos.filter((g) => mesDe(g.fecha) === r.mes);
  const comisiones = r.totalComisiones + suma(delMes.filter((g) => g.tipo === 'comision'), (g) => g.monto);
  const extras = suma(delMes.filter((g) => g.tipo !== 'comision'), (g) => g.monto);
  const neta = r.cobrado - r.gasto - comisiones - fijos - extras;
  const parteSocio = neta > 0 ? neta * Number(socioPct) / 100 : 0;
  return {
    parteSocio,
    tuParte: neta - parteSocio,
    ingresos: r.cobrado,
    gasto: r.gasto,
    comisiones,
    fijos,
    extras,
    neta,
    margen: r.cobrado ? neta / r.cobrado : null,
    costoPorVenta: r.ventas ? r.gasto / r.ventas : null,
  };
}

/** Países para el WhatsApp de los leads: código de país ISO y prefijo telefónico. */
export const PAISES = [
  ['UY', '🇺🇾', '+598'], ['AR', '🇦🇷', '+54'], ['ES', '🇪🇸', '+34'], ['MX', '🇲🇽', '+52'], ['US', '🇺🇸', '+1'],
  ['CL', '🇨🇱', '+56'], ['CO', '🇨🇴', '+57'], ['PE', '🇵🇪', '+51'], ['PY', '🇵🇾', '+595'], ['EC', '🇪🇨', '+593'],
];

/** Arma el WhatsApp completo: '+598' y '099 123 456' → '+598 99123456'. */
export function armarTelefono(pais, numero) {
  let n = String(numero ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (!n) return null;
  if (pais === 'AR' && !n.startsWith('9')) n = '9' + n;   // celulares de Argentina en WhatsApp: +54 9 …
  const prefijo = PAISES.find(([c]) => c === pais)?.[2] ?? '';
  return `${prefijo} ${n}`.trim();
}

/** Lo inverso, para editar un lead: separa el país del resto del número. */
export function separarTelefono(tel) {
  const t = String(tel ?? '').replace(/[^\d+]/g, '');
  // El prefijo más largo primero, para no confundir +595 (Paraguay) con +59…
  const p = [...PAISES].sort((a, b) => b[2].length - a[2].length).find(([, , pre]) => t.startsWith(pre));
  return p ? { pais: p[0], numero: t.slice(p[2].length) } : { pais: null, numero: t.replace(/^\+/, '') };
}
