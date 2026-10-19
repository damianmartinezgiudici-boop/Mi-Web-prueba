import * as calc from './calculos.js';
import { SUPABASE_URL } from './config.js';

const api = SUPABASE_URL ? await import('./api.js') : await import('./api-demo.js');

// ───────────── Estado ─────────────
let D = null;                                   // datos cargados
let usuario = null;
let mes = calc.mesDe(new Date().toISOString());
let metaSel = 'meta_objetivo';
let sup = null;                                  // supuestos de la calculadora (editables)
let tabLlamadas = 'cargar';
let tabCobros = 'confirmar';
let tabAjustes = 'equipo';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (n) => (n == null || isNaN(n) ? '—' : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-UY'));
const pct = (n) => (n == null ? '—' : Math.round(n * 100) + '%');
const num = (n) => Math.round(n).toLocaleString('es-UY');
const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: calc.ZONA });

const esAdmin = () => D.perfil.rol === 'admin';
const vende = () => ['admin', 'socio', 'closer'].includes(D.perfil.rol);
const nombreDe = (id) => D.perfiles.find((p) => p.id === id)?.nombre || '—';
const ofertaDe = (id) => D.ofertas.find((o) => o.id === id);
const metodoDe = (id) => D.metodos.find((m) => m.id === id);

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const nombreMes = (m) => `${MESES[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
const corto = (m) => MESES[+m.slice(5) - 1].slice(0, 3);
const ROLES = { admin: 'Admin', socio: 'Socio', closer: 'Closer', setter: 'Setter' };
const RESULTADOS = {
  no_se_presento: ['No se presentó', 'No entró a la llamada'],
  no_compro: ['No compró', 'Hizo la llamada y dijo que no'],
  seguimiento: ['Lo piensa', 'Queda en seguimiento'],
  compro: ['Compró', 'Cargás la venta y el pago'],
};
const CAPITAL_LEAD = { menos_1500: 'Menos de USD 1.500', '1500_3000': 'USD 1.500–3.000', mas_3000: 'Más de USD 3.000' };
const ESTADO_LEAD = { calificado: ['Calificado', 'good'], nutrir: ['Nutrir', 'warn'], agendado: ['Agendado', 'neutro'], descartado: ['Descartado', 'bad'] };

function hora(iso) {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('en-CA', { timeZone: calc.ZONA });
  const h = d.toLocaleTimeString('es-UY', { timeZone: calc.ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
  const manana = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: calc.ZONA });
  if (dia === hoyISO()) return `Hoy ${h}`;
  if (dia === manana) return `Mañ ${h}`;
  return `${dia.slice(8)}/${dia.slice(5, 7)} ${h}`;
}
const fecha = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

function aviso(texto) {
  const a = $('#aviso');
  a.textContent = texto; a.classList.add('on');
  clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove('on'), 2600);
}

// ───────────── Arranque ─────────────
async function iniciar() {
  usuario = await api.usuarioActual();
  api.alCambiarSesion((u) => { if (!!u !== !!usuario) { usuario = u; recargar(); } });
  await recargar();
  let t;
  api.escucharCambios(() => { clearTimeout(t); t = setTimeout(recargar, 600); });
}

async function recargar() {
  if (!usuario) return pintarLogin();
  try {
    D = await api.cargar(usuario);
  } catch (e) {
    $('#app').innerHTML = `<div class="login"><div class="card"><h2>No se pudo cargar</h2><p>${esc(e.message)}</p></div></div>`;
    return;
  }
  if (!D.perfil) return pintarSinAcceso();
  if (!sup) sup = supuestosDeConfig();
  pintar();
}

function supuestosDeConfig() {
  const c = D.config;
  return { ticket: +c.sup_ticket, cierre: +c.sup_cierre_pct, presentan: +c.sup_presentan_pct,
    calificadas: +c.sup_calificadas_pct, leadAgenda: +c.sup_lead_agenda_pct, costoAgenda: +c.sup_costo_agenda };
}

// ───────────── Login ─────────────
function pintarLogin() {
  $('#app').innerHTML = `
  <div class="login"><form class="card" id="f-login">
    <div class="brand">AMAZON <span>ELITE</span></div>
    <p>Entrá con el mail con el que te invitaron. Te mandamos un link para ingresar, sin contraseña.</p>
    <input type="email" name="email" placeholder="tu@mail.com" required autocomplete="email">
    <button class="btn">Mandarme el link</button>
    <div id="login-msg"></div>
  </form></div>`;
  $('#f-login').onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('#login-msg');
    try {
      await api.entrar(new FormData(e.target).get('email'));
      msg.innerHTML = '<p>Listo. Revisá tu mail y tocá el link para entrar.</p>';
    } catch (err) {
      const m = String(err.message || '');
      const texto = /signups? not allowed|not found|not allowed for otp/i.test(m)
        ? 'Ese mail no tiene acceso. Pedile a Damián que te invite.'
        : /rate limit|security purposes|after \d+ seconds/i.test(m)
          ? 'Se pidieron muchos links seguidos. Esperá unos minutos y probá de nuevo.'
          : `No se pudo mandar el link (${esc(m)}).`;
      msg.innerHTML = `<p class="error">${texto}</p>`;
    }
  };
}

function pintarSinAcceso() {
  $('#app').innerHTML = `<div class="login"><div class="card">
    <div class="brand">AMAZON <span>ELITE</span></div>
    <p>Tu usuario no tiene acceso al panel. Si creés que es un error, hablá con Damián.</p>
    <button class="btn alt" id="b-salir">Salir</button></div></div>`;
  $('#b-salir').onclick = async () => { await api.salir(); usuario = null; pintarLogin(); };
}

// ───────────── Pantalla principal ─────────────
function pintar() {
  const r = calc.resumenMes(D, mes);
  const meta = +D.config[metaSel];
  const e = calc.embudoInverso(meta, sup);
  const esteMes = mes === calc.mesDe(new Date().toISOString());
  const [a, m] = mes.split('-').map(Number);
  const diasMes = new Date(a, m, 0).getDate();
  const ritmo = esteMes ? Math.min(1, +hoyISO().slice(8) / diasMes) : mes < calc.mesDe(new Date().toISOString()) ? 1 : 0;
  const conversaciones = D.metaGasto.filter((g) => calc.mesDe(g.fecha) === mes).reduce((t, g) => t + Number(g.conversaciones), 0);
  const metaCostoCalif = sup.costoAgenda / (sup.calificadas / 100);

  $('#app').innerHTML = `
  ${api.demo ? barraDemo() : ''}
  <div class="wrap">
    <header>
      <div class="brand">AMAZON <span>ELITE</span></div>
      <div class="mes-nav">
        <button data-a="mes-ant" aria-label="Mes anterior">‹</button><b>${nombreMes(mes)}</b><button data-a="mes-sig" aria-label="Mes siguiente">›</button>
      </div>
      <button class="btn alt" data-a="lead">+ Lead</button>
      ${vende() ? '<button class="btn" data-a="venta">+ Venta</button>' : ''}
      ${esAdmin() ? '<button class="btn alt" data-a="sync" title="Traer ya los datos de Meta y Calendly">↻</button><button class="btn alt" data-a="ajustes">⚙ Ajustes</button>' : ''}
      <div class="yo"><span>${esc(D.perfil.nombre)} · ${ROLES[D.perfil.rol]}</span><button class="avatar" data-a="salir" title="Salir">${esc(D.perfil.nombre.slice(0, 2).toUpperCase())}</button></div>
    </header>

    ${r.historico ? `<div class="card" style="margin-bottom:16px;padding:12px 20px;font-size:13px;color:var(--ink-2)">📁 ${nombreMes(mes)} es anterior al panel: se muestran los datos históricos (cobrado, ventas por país, gasto en Meta y agendas). No hay detalle de llamadas ni comisiones.</div>` : ''}
    <section class="grid kpis">
      <div class="kpi g1">
        <div class="lbl">Cobrado del mes</div>
        <div class="val">${usd(r.cobrado)}</div>
        <div class="meta">de ${usd(meta)} · ${pct(r.cobrado / meta)}${r.porConfirmar ? ` · +${usd(r.porConfirmar)} por confirmar` : ''}</div>
        <div class="bar"><i style="width:${Math.min(100, (r.cobrado / meta) * 100)}%"></i></div>
      </div>
      <div class="kpi g2">
        <div class="lbl">Agendas calificadas</div>
        <div class="val">${r.calificadas}</div>
        <div class="meta">de ${e ? e.calificadas : '—'} necesarias · ${r.agendas} agendas en total</div>
        <div class="bar"><i style="width:${e ? Math.min(100, (r.calificadas / e.calificadas) * 100) : 0}%"></i></div>
      </div>
      <div class="kpi plain">
        <div class="lbl">Costo por agenda calificada</div>
        <div class="val">${usd(r.costoAgendaCalif)}</div>
        <div class="meta">${chipMeta(r.costoAgendaCalif, metaCostoCalif, true, `meta ${usd(metaCostoCalif)}`)} · Meta: ${usd(r.gasto)}</div>
      </div>
      <div class="kpi plain">
        <div class="lbl">Tasa de cierre</div>
        <div class="val">${pct(r.cierre)}</div>
        <div class="meta">${chipMeta(r.cierre, sup.cierre / 100, false, `meta ${sup.cierre}%`)} · ${r.compraron} de ${r.hechas} llamadas</div>
      </div>
    </section>

    <section class="grid main">
      <div class="card">
        <h2>¿Qué necesitamos para llegar a la meta?</h2>
        <div class="sub">Elegí la meta: el embudo se calcula hacia atrás. La barra muestra cuánto llevamos; la línea blanca, dónde deberíamos estar hoy.</div>
        <div class="goals">
          ${[['meta_base', 'Base'], ['meta_objetivo', 'Objetivo'], ['meta_record', 'Récord']].map(([k, t]) =>
            `<button class="goal ${metaSel === k ? 'on' : ''}" data-a="meta" data-k="${k}">${usd(+D.config[k] / 1000)}K<small>${t}</small></button>`).join('')}
        </div>
        ${e ? `
        <div class="funnel">
          ${paso('Leads (conversaciones)', conversaciones, e.leads, ritmo, `${num(Math.ceil(e.leads / diasMes))} por día`)}
          ${paso('Agendas', r.agendas, e.agendas, ritmo, `${num(Math.ceil(e.agendas / 4.3))} por semana`)}
          ${paso('Agendas calificadas', r.calificadas, e.calificadas, ritmo, `${num(Math.ceil(e.calificadas / 4.3))} por semana`)}
          ${paso('Llamadas hechas', r.hechas, e.llamadas, ritmo, `${num(Math.ceil(e.llamadas / 4.3))} por semana`)}
          ${paso('Ventas', r.ventas, e.ventas, ritmo, `${num(Math.ceil(e.ventas / 4.3))} por semana`)}
        </div>
        <div class="leyenda"><span><i style="background:linear-gradient(135deg,#22d3ee,#6366f1)"></i>Al ritmo o adelante</span><span><i style="background:linear-gradient(135deg,#f59e0b,#ef4444)"></i>Atrasados</span></div>
        <div class="result">
          <div><span>Inversión en Meta necesaria</span><b>${usd(e.inversion)}</b></div>
          <div><span>Por día</span><b>${usd(e.inversion / diasMes)}</b></div>
          <div><span>Retorno por dólar</span><b>${e.inversion ? (meta / e.inversion).toFixed(1) + 'x' : '—'}</b></div>
        </div>` : '<div class="vacio">Completá los supuestos de abajo (ninguno puede ser 0).</div>'}
        <div class="assume" id="supuestos">
          ${supuesto('ticket', 'Ticket promedio (USD)', r.ventas ? usd(r.vendido / r.ventas) : null)}
          ${supuesto('cierre', 'Cierre sobre llamadas hechas (%)', pct(r.cierre))}
          ${supuesto('presentan', 'Se presentan (%)', pct(r.presentan))}
          ${supuesto('calificadas', 'Agendas calificadas (%)', r.agendas ? pct(r.calificadas / r.agendas) : null)}
          ${supuesto('leadAgenda', 'Lead → agenda (%)', conversaciones ? (r.agendas / conversaciones * 100).toFixed(1) + '%' : null)}
          ${supuesto('costoAgenda', 'Costo por agenda (USD)', r.agendas && r.gasto ? usd(r.gasto / r.agendas) : null)}
        </div>
        ${esAdmin() ? '<div class="pie"><button class="btn alt chico" data-a="guardar-sup">Guardar supuestos para todo el equipo</button></div>' : ''}
      </div>

      <div class="side">
        ${tarjetaLlamadas(r)}
        ${tarjetaEquipo(r, e)}
      </div>
    </section>

    <section class="grid dos">
      ${tarjetaCobros()}
      ${tarjetaLeads()}
    </section>

    <section class="grid tres">
      <div class="card"><h2>Cobrado por mes (USD)</h2><div class="sub">Lo que entró, neto de comisiones de cobro</div><svg id="c-cash" viewBox="0 0 360 200" width="100%"></svg></div>
      <div class="card"><h2>Costo por agenda (USD)</h2><div class="sub">Inversión en Meta / agendas</div><svg id="c-cpa" viewBox="0 0 360 200" width="100%"></svg></div>
      <div class="card"><h2>Ventas por país</h2><div class="sub">Cantidad de ventas por mes</div>
        <div class="legend"><span><i style="background:var(--uy)"></i>Uruguay</span><span><i style="background:var(--ar)"></i>Argentina</span></div>
        <svg id="c-pais" viewBox="0 0 360 180" width="100%"></svg></div>
    </section>

    ${esAdmin() ? tarjetaCEO(r) : ''}
  </div>`;
  graficos();
}

function barraDemo() {
  const como = D.perfil.id;
  return `<div class="demo-bar">MODO DEMO · datos inventados, nada se guarda · Ver como:
    ${['damian', 'pedro', 'ramiro', 'gabo'].map((id) => `<button class="${como === id ? 'on' : ''}" data-a="ver-como" data-id="${id}">${nombreDe(id)}</button>`).join('')}</div>`;
}

function chipMeta(valor, meta, menorEsMejor, texto) {
  if (valor == null) return `<span class="chip neutro">${texto}</span>`;
  const bien = menorEsMejor ? valor <= meta : valor >= meta;
  const cerca = menorEsMejor ? valor <= meta * 1.2 : valor >= meta * 0.8;
  return `<span class="chip ${bien ? 'good' : cerca ? 'warn' : 'bad'}">${bien ? '✓' : cerca ? '●' : '▲'} ${texto}</span>`;
}

function paso(nombre, real, necesario, ritmo, detalle) {
  const avance = necesario ? Math.min(1, real / necesario) : 0;
  const atras = ritmo > 0 && avance < ritmo * 0.9;
  return `<div class="step"><span class="name">${nombre}</span>
    <div class="track" title="${num(real)} de ${num(necesario)}"><div class="fill ${atras ? 'atras' : ''}" style="width:${Math.max(2, avance * 100)}%"></div>
    ${ritmo > 0 && ritmo < 1 ? `<div class="ritmo" style="left:${ritmo * 100}%"></div>` : ''}</div>
    <span class="num">${num(real)} / ${num(necesario)}<small>${detalle}</small></span></div>`;
}

function supuesto(k, etiqueta, real) {
  return `<div><label for="s-${k}">${etiqueta}</label><input id="s-${k}" type="number" min="0" step="any" data-sup="${k}" value="${sup[k]}">
    <small>${real && real !== '—' ? `Real del mes: <b>${real}</b>` : '&nbsp;'}</small></div>`;
}

function tarjetaLlamadas(r) {
  const ahora = new Date();
  const proximas = D.agendas.filter((a) => a.estado === 'activa' && new Date(a.inicio) >= ahora).slice(0, 8);
  const paraCargar = D.agendas.filter((a) => a.estado === 'activa' && a.resultado === 'pendiente' && new Date(a.inicio) < ahora)
    .sort((x, y) => y.inicio.localeCompare(x.inicio));
  const lista = tabLlamadas === 'cargar' ? paraCargar : proximas;
  return `<div class="card">
    <h2>Llamadas</h2><div class="sub">Las agendas entran solas desde Calendly${vende() ? ' · tocá una para cargar el resultado' : ''}</div>
    <div class="tabs">
      <button class="tab ${tabLlamadas === 'cargar' ? 'on' : ''}" data-a="tab-llamadas" data-k="cargar">Para cargar ${paraCargar.length ? `<span class="badge">${paraCargar.length}</span>` : ''}</button>
      <button class="tab ${tabLlamadas === 'proximas' ? 'on' : ''}" data-a="tab-llamadas" data-k="proximas">Próximas</button>
    </div>
    <div class="list">${lista.length ? lista.slice(0, 8).map(filaAgenda).join('') :
      `<div class="vacio">${tabLlamadas === 'cargar' ? 'Todo al día: no hay llamadas sin resultado 🙌' : 'No hay llamadas agendadas.'}</div>`}</div>
  </div>`;
}

function filaAgenda(a) {
  const tag = vende() ? 'button' : 'div';
  return `<${tag} class="row" ${vende() ? `data-a="resultado" data-id="${a.id}"` : ''}>
    <span class="t">${hora(a.inicio)}</span>
    <span class="who">${esc(a.nombre)}${a.resultado !== 'pendiente' ? `<small>${RESULTADOS[a.resultado][0]}</small>` : ''}</span>
    ${a.pais ? `<span class="flag">${esc(a.pais)}</span>` : ''}
    <span class="chip ${a.calificada ? 'good' : 'bad'}" title="${esc(a.capital)}">${a.calificada ? 'Califica' : 'No califica'}</span>
  </${tag}>`;
}

function tarjetaEquipo(r, e) {
  const activos = D.perfiles.filter((p) => p.activo && p.rol !== 'admin');
  const ventasDe = (id) => D.ventas.filter((v) => v.closer_id === id && calc.mesDe(v.fecha) === mes).length;
  return `<div class="card"><h2>Equipo este mes</h2><div class="sub">Contra la meta elegida</div><div class="list">
    ${activos.map((p) => {
      const leadsFila = `<div class="row"><span class="who">${esc(p.nombre)} · leads calificados</span><b>${D.leads.filter((l) => l.setter_id === p.id && calc.mesDe(l.creado) === mes && ['calificado', 'agendado'].includes(l.estado)).length}</b></div>`;
      if (p.rol === 'setter') return leadsFila;
      if (p.rol === 'socio') return `<div class="row"><span class="who">${esc(p.nombre)} · ventas</span><b>${ventasDe(p.id)}</b></div>${leadsFila}`;
      const c = r.comisiones[p.id] ?? { confirmada: 0, aConfirmar: 0 };
      return `<div class="row"><span class="who">${esc(p.nombre)} · ventas</span><b>${ventasDe(p.id)}${e ? ` / ${e.ventas}` : ''}</b></div>
        <div class="row"><span class="who">${esc(p.nombre)} · comisión<small>${Number(D.config.comision_closer_pct)}% de lo que entra${c.aConfirmar ? ` · +${usd(c.aConfirmar)} por confirmar` : ''}</small></span><b>${usd(c.confirmada)}</b></div>`;
    }).join('') || '<div class="vacio">Todavía no hay equipo cargado.</div>'}
    <div class="row"><span class="who">No se presentaron</span><b>${r.noShow} de ${r.noShow + r.hechas}</b></div>
  </div></div>`;
}

function tarjetaCobros() {
  const porConfirmar = D.pagos.filter((p) => p.estado === 'informado');
  const conSaldo = calc.saldos(D).filter((v) => v.saldo > 0);
  const ventaDe = (id) => D.ventas.find((v) => v.id === id);
  let lista;
  if (tabCobros === 'confirmar') {
    lista = porConfirmar.map((p) => `<div class="row">
      <span class="t">${fecha(p.fecha)}</span>
      <span class="who">${esc(ventaDe(p.venta_id)?.cliente)}<small>${esc(metodoDe(p.metodo_id)?.nombre)}${+p.comision_metodo_pct ? ` · entra ${usd(p.neto)}` : ''} · informó ${esc(nombreDe(p.informado_por))}</small></span>
      <b>${usd(p.monto)}</b>
      ${esAdmin() ? `<span class="acciones"><button class="btn ok chico" data-a="recibido" data-id="${p.id}">✓ Recibido</button><button class="btn no chico" data-a="rechazar" data-id="${p.id}" aria-label="Rechazar">✕</button></span>`
        : '<span class="chip warn">Esperando a Damián</span>'}
    </div>`);
  } else {
    lista = conSaldo.map((v) => `<div class="row">
      <span class="t">${fecha(v.fecha)}</span>
      <span class="who">${esc(v.cliente)}<small>${esc(ofertaDe(v.oferta_id)?.nombre ?? '')} · pagó ${usd(v.pagado)} de ${usd(v.precio)}</small></span>
      <b>${usd(v.saldo)}</b>
      ${vende() ? `<button class="btn alt chico" data-a="pago" data-id="${v.id}">+ Pago</button>` : ''}
    </div>`);
  }
  return `<div class="card"><h2>Cobros</h2><div class="sub">Quien vende informa cada pago; Damián confirma que entró la plata</div>
    <div class="tabs">
      <button class="tab ${tabCobros === 'confirmar' ? 'on' : ''}" data-a="tab-cobros" data-k="confirmar">Por confirmar ${porConfirmar.length ? `<span class="badge">${porConfirmar.length}</span>` : ''}</button>
      <button class="tab ${tabCobros === 'saldos' ? 'on' : ''}" data-a="tab-cobros" data-k="saldos">Cuotas por cobrar (${conSaldo.length})</button>
    </div>
    <div class="list">${lista.join('') || `<div class="vacio">${tabCobros === 'confirmar' ? 'No hay pagos esperando confirmación.' : 'No hay cuotas pendientes.'}</div>`}</div>
  </div>`;
}

function tarjetaLeads() {
  const recientes = D.leads.slice(0, 8);
  return `<div class="card"><h2>Leads de WhatsApp</h2><div class="sub">Los que Gabo califica y todavía no agendaron · tocá uno para cambiar su estado</div>
    <div class="list">${recientes.map((l) => {
      const [txt, cls] = ESTADO_LEAD[l.estado];
      const puede = esAdmin() || l.setter_id === D.perfil.id;
      const tag = puede ? 'button' : 'div';
      return `<${tag} class="row" ${puede ? `data-a="lead-editar" data-id="${l.id}"` : ''}>
        <span class="t">${hora(l.creado).replace(/ \d\d:\d\d$/, '')}</span>
        <span class="who">${esc(l.nombre)}<small>${esc(CAPITAL_LEAD[l.capital] ?? 'Capital sin dato')}</small></span>
        ${l.pais ? `<span class="flag">${esc(l.pais)}</span>` : ''}<span class="chip ${cls}">${txt}</span></${tag}>`;
    }).join('') || '<div class="vacio">Todavía no hay leads cargados.</div>'}</div></div>`;
}

function tarjetaCEO(r) {
  const socioPct = Number(D.configPrivada?.socio_pct ?? 0);
  const g = calc.ganancia(r, D.costosFijos, socioPct);
  const socios = D.perfiles.filter((p) => p.rol === 'socio' && p.activo).map((p) => p.nombre).join(' y ') || 'Socio';
  return `<section class="card lock">
    <h2>🔒 Solo Damián</h2><div class="sub">El resto del equipo no recibe estos datos: la base de datos no se los manda.</div>
    <div class="items">
      <div>Cobrado neto<b>${usd(g.ingresos)}</b></div>
      <div>− Meta Ads<b>${usd(g.gasto)}</b></div>
      <div>− Comisiones<b>${usd(g.comisiones)}</b></div>
      <div>− Costos fijos<b>${usd(g.fijos)}</b></div>
      <div>Costo por venta<b>${usd(g.costoPorVenta)}</b></div>
      <div>Ganancia neta · ${pct(g.margen)}<b>${usd(g.neta)}</b></div>
    </div>
    <div class="items" style="margin-top:10px;grid-template-columns:1fr 1fr">
      <div>Parte de ${esc(socios)} (${socioPct}%)<b>${usd(g.parteSocio)}</b></div>
      <div class="total">Tu parte<b>${usd(g.tuParte)}</b></div>
    </div></section>`;
}

// ───────────── Gráficos ─────────────
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; }
function tip(nodo, texto) {
  const t = $('#tip');
  nodo.addEventListener('mousemove', (e) => { t.textContent = texto; t.style.opacity = 1; t.style.left = e.clientX + 12 + 'px'; t.style.top = e.clientY + 12 + 'px'; });
  nodo.addEventListener('mouseleave', () => (t.style.opacity = 0));
}
function tope(v) { const p = 10 ** Math.floor(Math.log10(v || 1)); return Math.ceil((v || 1) / p) * p; }
function ejes(svg, max, H, W, pad, f) {
  for (let i = 0; i <= 4; i++) {
    const y = H - pad.b - (H - pad.t - pad.b) * i / 4;
    el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: '#2a3052', 'stroke-width': 1 }, svg);
    el('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end' }, svg).textContent = f(max * i / 4);
  }
}
function barras(svg, etiquetas, series, colores, nombres, f) {
  const W = 360, H = +svg.getAttribute('viewBox').split(' ')[3], pad = { l: 44, r: 8, t: 10, b: 24 };
  const max = tope(Math.max(...series.flat()));
  ejes(svg, max, H, W, pad, f);
  const gw = (W - pad.l - pad.r) / etiquetas.length, bw = Math.min(28, (gw - 16) / series.length);
  etiquetas.forEach((lab, i) => {
    const x0 = pad.l + gw * i + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
    series.forEach((s, j) => {
      const h = (H - pad.t - pad.b) * s[i] / max, x = x0 + j * (bw + 2), y = H - pad.b - h, rr = Math.min(4, h);
      if (h > 0) el('path', { d: `M${x},${H - pad.b} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${H - pad.b} Z`, fill: colores[j] }, svg);
      tip(el('rect', { x: x - 2, y: pad.t, width: bw + 4, height: H - pad.t - pad.b, fill: 'transparent' }, svg), `${lab} · ${nombres[j]}: ${f(s[i])}`);
    });
    el('text', { x: pad.l + gw * i + gw / 2, y: H - 6, 'text-anchor': 'middle' }, svg).textContent = lab;
  });
}
function graficos() {
  const meses = [];
  for (let i = 5; i >= 0; i--) { const m = calc.mesAnterior(mes, i); if (m >= '2026-07') meses.push(m); }
  const s = calc.serie(D, meses);
  const k = (n) => (n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n));
  barras($('#c-cash'), meses.map(corto), [s.map((x) => x.cobrado)], ['#c86bfa'], ['Cobrado'], k);
  barras($('#c-pais'), meses.map(corto), [s.map((x) => x.uy), s.map((x) => x.ar)], ['var(--uy)', 'var(--ar)'], ['Uruguay', 'Argentina'], (n) => Math.round(n));

  const svg = $('#c-cpa'), W = 360, H = 200, pad = { l: 44, r: 16, t: 18, b: 24 };
  const vals = s.map((x) => x.costoAgenda);
  const max = tope(Math.max(...vals.filter((v) => v != null), 10));
  ejes(svg, max, H, W, pad, (n) => '$' + Math.round(n));
  const xs = meses.map((_, i) => pad.l + 12 + (W - pad.l - pad.r - 24) * (meses.length > 1 ? i / (meses.length - 1) : 0.5));
  const ys = vals.map((v) => (v == null ? null : H - pad.b - (H - pad.t - pad.b) * v / max));
  const d = xs.map((x, i) => (ys[i] == null ? '' : `${i && ys[i - 1] != null ? 'L' : 'M'}${x},${ys[i]}`)).join(' ');
  el('path', { d, fill: 'none', stroke: '#22d3ee', 'stroke-width': 2 }, svg);
  const conValor = vals.map((v, i) => [v, i]).filter(([v]) => v != null);
  const extremos = new Set(conValor.length ? [conValor.reduce((a, b) => (b[0] < a[0] ? b : a))[1], conValor.reduce((a, b) => (b[0] > a[0] ? b : a))[1]] : []);
  xs.forEach((x, i) => {
    el('text', { x, y: H - 6, 'text-anchor': 'middle' }, svg).textContent = corto(meses[i]);
    if (ys[i] == null) return;
    el('circle', { cx: x, cy: ys[i], r: 4.5, fill: '#22d3ee', stroke: '#171b2e', 'stroke-width': 2 }, svg);
    if (extremos.has(i)) el('text', { x, y: ys[i] - 10, 'text-anchor': 'middle', style: 'fill:#f3f4fb;font-weight:600' }, svg).textContent = '$' + Math.round(vals[i]);
    tip(el('rect', { x: x - 20, y: pad.t, width: 40, height: H - pad.t - pad.b, fill: 'transparent' }, svg), `${corto(meses[i])}: $${Math.round(vals[i])} por agenda`);
  });
}

// ───────────── Ventanas (modales) ─────────────
const modal = $('#modal');
function abrir(html, { ancho = false } = {}) {
  modal.className = ancho ? 'ancho' : '';
  modal.innerHTML = `<div class="modal">${html}</div>`;
  if (!modal.open) modal.showModal();
}
const cerrar = () => modal.close();
modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });

async function enviar(form, accion) {
  const boton = form.querySelector('[type=submit]');
  const err = form.querySelector('.error');
  boton.disabled = true;
  try { await accion(Object.fromEntries(new FormData(form))); cerrar(); await recargar(); }
  catch (e) { if (err) err.textContent = e.message; boton.disabled = false; }
}

function modalResultado(id) {
  const a = D.agendas.find((x) => x.id === id);
  abrir(`<h3>${esc(a.nombre)}</h3>
    <div class="sub">${hora(a.inicio)} · ${esc(a.pais ?? '')} · Capital: ${esc(a.capital ?? 'sin dato')}${a.telefono ? ` · ${esc(a.telefono)}` : ''}</div>
    <div class="opciones">${Object.entries(RESULTADOS).map(([k, [t, s]]) =>
      `<button class="opcion ${a.resultado === k ? 'on' : ''}" data-a="elegir-resultado" data-id="${a.id}" data-k="${k}">${t}<small>${s}</small></button>`).join('')}</div>
    <label>Notas (opcional)<textarea id="r-notas" rows="2">${esc(a.notas ?? '')}</textarea></label>
    <div class="error"></div>
    <div class="pie"><button class="btn alt" data-a="cerrar">Cancelar</button></div>`);
}

function modalVenta(agendaId) {
  const a = agendaId ? D.agendas.find((x) => x.id === agendaId) : null;
  const o0 = D.ofertas.find((o) => o.activa);
  abrir(`<h3>Nueva venta</h3><div class="sub">Se registra la venta y el primer pago (seña o total). Damián confirma cuando entra la plata.</div>
    <form id="f-venta" style="display:contents">
      <div class="campos">
        <label>Cliente<input name="cliente" required value="${esc(a?.nombre ?? '')}"></label>
        <label>País<select name="pais">${['UY', 'AR', 'OTRO'].map((p) => `<option ${a?.pais === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label>Oferta<select name="oferta_id" id="v-oferta">${D.ofertas.filter((o) => o.activa).map((o) => `<option value="${o.id}" data-precio="${o.precio}">${esc(o.nombre)} · ${usd(o.precio)}</option>`).join('')}</select></label>
        <label>Precio final (USD)<input name="precio" id="v-precio" type="number" min="1" step="any" required value="${o0?.precio ?? ''}"></label>
        <label>Primer pago (USD)<input name="monto" id="v-monto" type="number" min="1" step="any" required value="${o0?.precio ?? ''}"></label>
        <label>Método de pago<select name="metodo_id">${D.metodos.filter((m) => m.activo).map((m) => `<option value="${m.id}">${esc(m.nombre)}${+m.comision_pct ? ` (−${+m.comision_pct}%)` : ''}</option>`).join('')}</select></label>
        <label>Fecha<input name="fecha" type="date" required value="${hoyISO()}"></label>
      </div>
      <div class="error"></div>
      <div class="pie"><button type="button" class="btn alt" data-a="cerrar">Cancelar</button><button type="submit" class="btn">Guardar venta</button></div>
    </form>`);
  $('#v-oferta').onchange = (e) => { const p = e.target.selectedOptions[0].dataset.precio; $('#v-precio').value = p; $('#v-monto').value = p; };
  $('#f-venta').onsubmit = (e) => { e.preventDefault(); enviar(e.target, (f) => api.crearVenta({
    venta: { cliente: f.cliente, pais: f.pais, oferta_id: +f.oferta_id, precio: +f.precio, fecha: f.fecha, agenda_id: agendaId ?? null },
    pago: { monto: +f.monto, metodo_id: +f.metodo_id, fecha: f.fecha },
    agendaId,
  })); };
}

function modalPago(ventaId) {
  const v = calc.saldos(D).find((x) => x.id === ventaId);
  abrir(`<h3>Pago de ${esc(v.cliente)}</h3><div class="sub">Pagó ${usd(v.pagado)} de ${usd(v.precio)} · falta ${usd(v.saldo)}</div>
    <form id="f-pago" style="display:contents"><div class="campos">
      <label>Monto (USD)<input name="monto" type="number" min="1" step="any" required value="${v.saldo}"></label>
      <label>Método<select name="metodo_id">${D.metodos.filter((m) => m.activo).map((m) => `<option value="${m.id}">${esc(m.nombre)}${+m.comision_pct ? ` (−${+m.comision_pct}%)` : ''}</option>`).join('')}</select></label>
      <label>Fecha<input name="fecha" type="date" required value="${hoyISO()}"></label></div>
      <div class="error"></div>
      <div class="pie"><button type="button" class="btn alt" data-a="cerrar">Cancelar</button><button type="submit" class="btn">Informar pago</button></div></form>`);
  $('#f-pago').onsubmit = (e) => { e.preventDefault(); enviar(e.target, (f) => api.crearPago({ venta_id: ventaId, monto: +f.monto, metodo_id: +f.metodo_id, fecha: f.fecha })); };
}

function modalLead(id) {
  const l = id ? D.leads.find((x) => x.id === id) : {};
  abrir(`<h3>${id ? esc(l.nombre) : 'Nuevo lead'}</h3><div class="sub">Lead de WhatsApp que todavía no agendó. Cuando agende, entra solo desde Calendly.</div>
    <form id="f-lead" style="display:contents"><div class="campos">
      <label>Nombre<input name="nombre" required value="${esc(l.nombre ?? '')}"></label>
      <label>WhatsApp<input name="telefono" placeholder="+598…" value="${esc(l.telefono ?? '')}"></label></div>
      <label>¿Con cuánto capital cuenta?</label>
      <div class="opciones" style="grid-template-columns:repeat(3,1fr)">${Object.entries(CAPITAL_LEAD).map(([k, t]) =>
        `<label class="opcion ${l.capital === k ? 'on' : ''}" style="flex-direction:row;align-items:center"><input type="radio" name="capital" value="${k}" ${l.capital === k ? 'checked' : ''} style="width:auto">${t}</label>`).join('')}</div>
      <label>Estado<select name="estado">${Object.entries(ESTADO_LEAD).map(([k, [t]]) => `<option value="${k}" ${l.estado === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Notas<textarea name="notas" rows="2">${esc(l.notas ?? '')}</textarea></label>
      <div class="error"></div>
      <div class="pie"><button type="button" class="btn alt" data-a="cerrar">Cancelar</button><button type="submit" class="btn">Guardar</button></div></form>`);
  $('#f-lead').addEventListener('change', (e) => {
    if (e.target.name === 'capital') $('#f-lead').querySelectorAll('.opcion').forEach((o) => o.classList.toggle('on', o.contains(e.target)));
  });
  $('#f-lead').onsubmit = (e) => {
    e.preventDefault();
    enviar(e.target, (f) => {
      const tel = f.telefono.replace(/[^\d+]/g, '');
      const pais = tel.startsWith('+598') || /^09\d{7}$/.test(tel) ? 'UY' : tel.startsWith('+54') ? 'AR' : tel ? 'OTRO' : null;
      const lead = { nombre: f.nombre, telefono: f.telefono || null, pais, capital: f.capital || null, estado: f.estado, notas: f.notas || null };
      return id ? api.actualizarLead(id, lead) : api.crearLead(lead);
    });
  };
}

function modalAjustes() {
  const t = tabAjustes;
  const tabs = [['equipo', 'Equipo'], ['metas', 'Metas y supuestos'], ['ofertas', 'Ofertas y pagos'], ['costos', 'Costos fijos 🔒'], ['conexiones', 'Conexiones']];
  let cuerpo = '';
  if (t === 'equipo') {
    cuerpo = `<table class="tabla"><tr><th>Nombre</th><th>Mail</th><th>Rol</th><th></th></tr>
      ${D.perfiles.map((p) => `<tr style="${p.activo ? '' : 'opacity:.5'}"><td>${esc(p.nombre)}</td><td>${esc(p.email)}</td>
        <td>${p.dueno ? 'Admin (dueño)' : `<select data-a="rol" data-id="${p.id}">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${p.rol === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`}</td>
        <td>${p.dueno ? '' : p.activo ? `<button class="btn no chico" data-a="quitar" data-id="${p.id}">Quitar acceso</button>` : `<button class="btn alt chico" data-a="reactivar" data-id="${p.id}">Reactivar</button>`}</td></tr>`).join('')}
      </table>
      <form id="f-invitar" style="display:contents"><h3 style="font-size:15px">Invitar a alguien</h3><div class="campos">
        <label>Nombre<input name="nombre" required></label><label>Mail<input name="email" type="email" required></label>
        <label>Rol<select name="rol"><option value="setter">Setter</option><option value="closer">Closer</option><option value="socio">Socio</option><option value="admin">Admin</option></select></label>
        <label>&nbsp;<button type="submit" class="btn">Mandar invitación</button></label></div><div class="error"></div></form>
      <p class="sub" style="margin:0">Setter: carga leads. Closer: carga resultados, ventas y pagos (cobra comisión). Socio: lo mismo que setter y closer, sin comisión y sin ver ganancias. Admin: todo. Quien no está en esta lista no puede entrar.</p>`;
  } else if (t === 'metas') {
    const c = D.config;
    const campo = (k, txt) => `<label>${txt}<input name="${k}" type="number" step="any" min="0" value="${+c[k]}"></label>`;
    cuerpo = `<form id="f-config" style="display:contents"><div class="campos">
      ${campo('meta_base', 'Meta base (USD)')}${campo('meta_objetivo', 'Meta objetivo (USD)')}${campo('meta_record', 'Meta récord (USD)')}
      ${campo('comision_closer_pct', 'Comisión del closer (%)')}${campo('capital_minimo', 'Capital mínimo para calificar (USD)')}
      ${campo('sup_ticket', 'Ticket promedio (USD)')}${campo('sup_cierre_pct', 'Cierre (%)')}${campo('sup_presentan_pct', 'Se presentan (%)')}
      ${campo('sup_calificadas_pct', 'Agendas calificadas (%)')}${campo('sup_lead_agenda_pct', 'Lead → agenda (%)')}${campo('sup_costo_agenda', 'Costo por agenda (USD)')}
      </div><div class="error"></div><div class="pie"><button type="submit" class="btn">Guardar</button></div></form>`;
  } else if (t === 'ofertas') {
    cuerpo = `<table class="tabla"><tr><th>Oferta</th><th>Precio (USD)</th><th>Activa</th></tr>
      ${D.ofertas.map((o) => `<tr><td><input data-fila="ofertas" data-id="${o.id}" data-k="nombre" value="${esc(o.nombre)}"></td>
        <td><input data-fila="ofertas" data-id="${o.id}" data-k="precio" type="number" value="${+o.precio}"></td>
        <td><input data-fila="ofertas" data-id="${o.id}" data-k="activa" type="checkbox" ${o.activa ? 'checked' : ''} style="width:auto"></td></tr>`).join('')}</table>
      <button class="btn alt chico" data-a="nueva-fila" data-tabla="ofertas" style="align-self:flex-start">+ Oferta</button>
      <table class="tabla"><tr><th>Método de pago</th><th>Comisión (%)</th><th>Activo</th></tr>
      ${D.metodos.map((m) => `<tr><td><input data-fila="metodos_pago" data-id="${m.id}" data-k="nombre" value="${esc(m.nombre)}"></td>
        <td><input data-fila="metodos_pago" data-id="${m.id}" data-k="comision_pct" type="number" step="any" value="${+m.comision_pct}"></td>
        <td><input data-fila="metodos_pago" data-id="${m.id}" data-k="activo" type="checkbox" ${m.activo ? 'checked' : ''} style="width:auto"></td></tr>`).join('')}</table>
      <button class="btn alt chico" data-a="nueva-fila" data-tabla="metodos_pago" style="align-self:flex-start">+ Método</button>
      <p class="sub" style="margin:0">Los cambios se guardan solos. Si cambia la comisión de un método, los pagos ya cargados no se tocan.</p>`;
  } else if (t === 'conexiones') {
    const ultimaAgenda = D.agendas.length ? D.agendas.reduce((a, b) => (a.creado > b.creado ? a : b)).creado : null;
    const ultimoGasto = D.metaGasto.length ? D.metaGasto.reduce((a, b) => (a.fecha > b.fecha ? a : b)).fecha : null;
    cuerpo = `<div class="list">
      <div class="row"><span class="who">Calendly<small>${ultimaAgenda ? `Última agenda recibida: ${hora(ultimaAgenda)}` : 'Todavía no entró ninguna agenda'}</small></span>
        <button class="btn alt chico" data-a="activar-aviso">Activar aviso en vivo</button></div>
      <div class="row"><span class="who">Meta Ads<small>${ultimoGasto ? `Gasto cargado hasta el ${fecha(ultimoGasto)}` : 'Todavía no hay gasto cargado'}</small></span>
        <button class="btn alt chico" data-a="historial">Traer últimos 45 días</button></div>
      </div>
      <div id="conexion-msg" class="sub" style="margin:0"></div>
      <p class="sub" style="margin:0">El aviso en vivo hace que cada agenda nueva o cancelada aparezca al instante. Además, cada hora se repasa Calendly y se trae el gasto de Meta.</p>`;
  } else {
    const total = D.costosFijos.filter((c) => c.activo).reduce((s, c) => s + +c.monto, 0);
    cuerpo = `<table class="tabla"><tr><th>Concepto</th><th>USD por mes</th><th></th></tr>
      ${D.costosFijos.map((c) => `<tr><td><input data-fila="costos_fijos" data-id="${c.id}" data-k="concepto" value="${esc(c.concepto)}"></td>
        <td><input data-fila="costos_fijos" data-id="${c.id}" data-k="monto" type="number" value="${+c.monto}"></td>
        <td><button class="btn no chico" data-a="borrar-costo" data-id="${c.id}" aria-label="Borrar">✕</button></td></tr>`).join('')}
      <tr><th>Total</th><th>${usd(total)}</th><th></th></tr></table>
      <button class="btn alt chico" data-a="nueva-fila" data-tabla="costos_fijos" style="align-self:flex-start">+ Costo</button>
      <label style="max-width:260px">% de la ganancia neta para el socio<input data-a="socio-pct" type="number" min="0" max="100" step="any" value="${Number(D.configPrivada?.socio_pct ?? 0)}"></label>
      <p class="sub" style="margin:0">Solo vos ves esto. Meta Ads y las comisiones se suman solas. Si el mes da pérdida, no hay reparto.</p>`;
  }
  abrir(`<h3>Ajustes</h3><div class="tabs">${tabs.map(([k, v]) => `<button class="tab ${t === k ? 'on' : ''}" data-a="tab-ajustes" data-k="${k}">${v}</button>`).join('')}</div>
    ${cuerpo}<div class="pie"><button class="btn alt" data-a="cerrar">Cerrar</button></div>`, { ancho: true });

  $('#f-invitar')?.addEventListener('submit', (e) => { e.preventDefault(); accionAjustes(e.target, (f) => api.equipo('invitar', f), 'Invitación enviada'); });
  $('#f-config')?.addEventListener('submit', (e) => {
    e.preventDefault();
    accionAjustes(e.target, async (f) => { await api.guardarConfig(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, +v]))); sup = null; }, 'Guardado');
  });
}

async function accionAjustes(form, accion, ok) {
  const err = form?.querySelector('.error');
  try { await accion(form ? Object.fromEntries(new FormData(form)) : null); await recargar(); modalAjustes(); aviso(ok); }
  catch (e) { if (err) err.textContent = e.message; else aviso(e.message); }
}

// ───────────── Clicks ─────────────
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const { a, id, k } = b.dataset;
  try {
    switch (a) {
      case 'mes-ant': mes = calc.mesAnterior(mes); pintar(); break;
      case 'mes-sig': mes = calc.mesAnterior(mes, -1); pintar(); break;
      case 'meta': metaSel = k; pintar(); break;
      case 'tab-llamadas': tabLlamadas = k; pintar(); break;
      case 'tab-cobros': tabCobros = k; pintar(); break;
      case 'tab-ajustes': tabAjustes = k; modalAjustes(); break;
      case 'ver-como': api.verComo(id); usuario = await api.usuarioActual(); sup = null; await recargar(); break;
      case 'salir': if (confirm('¿Salir del panel?')) { await api.salir(); usuario = null; pintarLogin(); } break;
      case 'cerrar': cerrar(); break;
      case 'lead': modalLead(); break;
      case 'lead-editar': modalLead(id); break;
      case 'venta': modalVenta(); break;
      case 'pago': modalPago(id); break;
      case 'resultado': modalResultado(id); break;
      case 'elegir-resultado': {
        const notas = $('#r-notas').value || null;
        if (k === 'compro') modalVenta(id);   // la agenda pasa a "compró" cuando se guarda la venta
        else { await api.guardarResultado(id, { resultado: k, notas, closer_id: D.perfil.id }); cerrar(); await recargar(); aviso('Resultado guardado'); }
        break;
      }
      case 'recibido': await api.revisarPago(id, 'recibido'); await recargar(); aviso('Pago confirmado'); break;
      case 'rechazar': if (confirm('¿Marcar este pago como NO recibido?')) { await api.revisarPago(id, 'rechazado'); await recargar(); } break;
      case 'guardar-sup':
        await api.guardarConfig({ sup_ticket: sup.ticket, sup_cierre_pct: sup.cierre, sup_presentan_pct: sup.presentan,
          sup_calificadas_pct: sup.calificadas, sup_lead_agenda_pct: sup.leadAgenda, sup_costo_agenda: sup.costoAgenda });
        aviso('Supuestos guardados para todo el equipo'); break;
      case 'sync': b.disabled = true; aviso('Actualizando Meta y Calendly…'); await api.sincronizar(); await recargar(); aviso('Datos actualizados'); break;
      case 'ajustes': modalAjustes(); break;
      case 'activar-aviso': case 'historial': {
        const msg = $('#conexion-msg');
        b.disabled = true; msg.textContent = 'Conectando…';
        try {
          const r = a === 'activar-aviso' ? await api.activarAviso() : await api.sincronizar(45, true);
          msg.textContent = Object.values(r).join(' · ');
          if (a === 'historial') { await recargar(); modalAjustes(); $('#conexion-msg').textContent = Object.values(r).join(' · '); }
        } catch (err) { msg.textContent = 'Error: ' + err.message; }
        b.disabled = false; break;
      }
      case 'quitar':
        if (confirm(`¿Quitarle el acceso a ${nombreDe(id)}? Deja de poder entrar al instante. Lo que cargó queda guardado.`)) {
          await accionAjustes(null, () => api.equipo('quitar', { id }), 'Acceso quitado');
        } break;
      case 'reactivar': await accionAjustes(null, () => api.equipo('reactivar', { id }), 'Acceso reactivado'); break;
      case 'nueva-fila': {
        const tabla = b.dataset.tabla;
        const fila = tabla === 'ofertas' ? { nombre: 'NUEVA', precio: 1000 } : tabla === 'metodos_pago' ? { nombre: 'Nuevo método', comision_pct: 0 } : { concepto: 'Nuevo costo', monto: 0 };
        await accionAjustes(null, () => api.guardarFila(tabla, fila), 'Agregado'); break;
      }
      case 'borrar-costo': if (confirm('¿Borrar este costo?')) await accionAjustes(null, () => api.borrarFila('costos_fijos', +id), 'Borrado'); break;
    }
  } catch (err) { aviso('Error: ' + err.message); }
});

// Cambios en supuestos, roles y tablas de ajustes.
document.addEventListener('input', (e) => {
  const s = e.target.dataset.sup;
  if (!s) return;
  sup[s] = +e.target.value;
  clearTimeout(document.t);
  document.t = setTimeout(() => { const foco = e.target.id; pintar(); const n = document.getElementById(foco); n?.focus(); }, 400);
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  try {
    if (t.dataset.a === 'socio-pct') { await api.guardarConfigPrivada({ socio_pct: +t.value }); await recargar(); modalAjustes(); aviso('Guardado'); }
    if (t.dataset.a === 'rol') { await api.cambiarRol(t.dataset.id, t.value); await recargar(); modalAjustes(); aviso('Rol actualizado'); }
    if (t.dataset.fila) {
      const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : t.value;
      await api.guardarFila(t.dataset.fila, { id: +t.dataset.id, [t.dataset.k]: v });
      await recargar(); modalAjustes(); aviso('Guardado');
    }
  } catch (err) { aviso('Error: ' + err.message); }
});

iniciar();
