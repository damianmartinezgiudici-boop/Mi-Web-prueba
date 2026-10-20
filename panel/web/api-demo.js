// Modo demo: mismos métodos que api.js pero con datos inventados en memoria.
// Sirve para ver el panel antes de conectar Supabase. Nada se guarda.

export const demo = true;

let n = 7;
const azar = () => ((n = (n * 16807) % 2147483647) / 2147483647);
const elegir = (xs) => xs[Math.floor(azar() * xs.length)];
const uid = () => 'd' + Math.floor(azar() * 1e12).toString(36);
const hoy = new Date();
const diaISO = (d) => d.toISOString().slice(0, 10);

const perfiles = [
  { id: 'damian', email: 'damian@amazonelite', nombre: 'Damián', rol: 'admin', activo: true, dueno: true },
  { id: 'ramiro', email: 'ramiro@amazonelite', nombre: 'Ramiro', rol: 'closer', activo: true, dueno: false },
  { id: 'gabo', email: 'gabo@amazonelite', nombre: 'Gabo', rol: 'setter', activo: true, dueno: false },
  { id: 'pedro', email: 'pedro@amazonelite', nombre: 'Pedro', rol: 'socio', activo: true, dueno: false },
];
const configPrivada = { socio_pct: 30 };
const config = {
  meta_base: 30000, meta_objetivo: 40000, meta_record: 50000, comision_closer_pct: 10, comision_setter_pct: 5, capital_minimo: 1000,
  sup_ticket: 1530, sup_cierre_pct: 30, sup_presentan_pct: 75, sup_calificadas_pct: 60, sup_lead_agenda_pct: 5, sup_costo_agenda: 35,
};
const ofertas = [
  { id: 1, nombre: 'PRIME', precio: 950, activa: true },
  { id: 2, nombre: 'VIP', precio: 1850, activa: true },
  { id: 3, nombre: 'BLACK', precio: 2500, activa: true },
];
const metodos = [
  { id: 1, nombre: 'Transferencia local', comision_pct: 0, activo: true },
  { id: 2, nombre: 'Transferencia Argentina', comision_pct: 0, activo: true },
  { id: 3, nombre: 'dLocal', comision_pct: 6, activo: true },
];
const costosFijos = [
  { id: 1, concepto: 'Empresa', monto: 800, activo: true },
  { id: 2, concepto: 'Equipo de coaches', monto: 1080, activo: true },
  { id: 3, concepto: 'Plataformas (Skool, ManyChat, Calendly, Zoom, verificado IG, otras)', monto: 300, activo: true },
];
const gastos = [
  { id: 1, fecha: new Date().toISOString().slice(0, 10), concepto: 'Editor de videos', tipo: 'extra', monto: 150 },
];
const historico = [
  { mes: '2026-07-01', cobrado: 26340, ventas_uy: 20, ventas_ar: 1, gasto_meta: 3071.05, agendas: 146 },
  { mes: '2026-08-01', cobrado: 26192, ventas_uy: 11, ventas_ar: 6, gasto_meta: 4998.64, agendas: 132 },
  { mes: '2026-09-01', cobrado: 33095, ventas_uy: 8, ventas_ar: 10, gasto_meta: 5204.3, agendas: 73 },
  { mes: '2026-10-01', cobrado: 0, ventas_uy: 0, ventas_ar: 0, gasto_meta: 1817.02, agendas: 34 },
];

const NOMBRES = ['Lucía Pérez', 'Martín Gómez', 'Sofía Rodríguez', 'Diego Fernández', 'Valentina López', 'Nicolás Silva',
  'Camila Torres', 'Joaquín Díaz', 'Florencia Castro', 'Matías Romero', 'Agustina Suárez', 'Federico Méndez',
  'Carolina Ríos', 'Santiago Núñez', 'Paula Acosta', 'Bruno Herrera'];
const CAPITAL = ['Más de USD 3.000', 'Entre USD 2.000 y 3.000', 'Entre USD 1.500 y 2.000', 'Menos de USD 1.500', 'Hoy no tengo capital'];

const agendas = [], ventas = [], pagos = [], leads = [], metaGasto = [];
const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
for (let d = new Date(inicioMes); d.getMonth() === inicioMes.getMonth(); d.setDate(d.getDate() + 1)) {
  if (d <= hoy) {
    metaGasto.push({ fecha: diaISO(d), pais: 'UY', gasto: 28 + Math.round(azar() * 8), conversaciones: 30 + Math.round(azar() * 15) });
    metaGasto.push({ fecha: diaISO(d), pais: 'AR', gasto: 22 + Math.round(azar() * 8), conversaciones: 35 + Math.round(azar() * 15) });
  }
  const porDia = Math.floor(azar() * 3);
  for (let i = 0; i < porDia; i++) {
    const inicio = new Date(d); inicio.setHours(15 + Math.floor(azar() * 6), elegir([0, 30]), 0, 0);
    const pais = azar() < 0.6 ? 'UY' : 'AR';
    const capital = elegir(CAPITAL.concat(CAPITAL.slice(0, 3)));
    const calificada = CAPITAL.indexOf(capital) < 3;
    const nivel = calificada ? 'califica' : capital.startsWith('Menos') ? 'medio' : 'no';
    const pasada = inicio < hoy;
    let resultado = 'pendiente';
    if (pasada && azar() < 0.85) {
      const x = azar();
      resultado = x < 0.15 ? 'no_se_presento' : !calificada ? 'no_compro' : x < 0.55 ? 'compro' : x < 0.75 ? 'seguimiento' : 'no_compro';
    }
    const a = { id: uid(), nombre: elegir(NOMBRES), telefono: pais === 'UY' ? '+598 9' : '+54 9 11', pais, capital, calificada, nivel,
      inicio: inicio.toISOString(), estado: 'activa', resultado, closer_id: resultado === 'pendiente' ? null : 'ramiro', notas: '' };
    agendas.push(a);
    if (resultado === 'compro') {
      const oferta = elegir(ofertas);
      const v = { id: uid(), agenda_id: a.id, cliente: a.nombre, pais, oferta_id: oferta.id, precio: oferta.precio,
        closer_id: 'ramiro', fecha: diaISO(inicio) };
      ventas.push(v);
      const metodo = elegir(metodos);
      const monto = azar() < 0.5 ? oferta.precio : Math.round(oferta.precio / 2);
      pagos.push(nuevoPago({ venta_id: v.id, monto, metodo_id: metodo.id, fecha: v.fecha,
        estado: azar() < 0.8 ? 'recibido' : 'informado', informado_por: 'ramiro' }));
    }
  }
}
for (let i = 0; i < 22; i++) {
  const d = new Date(inicioMes.getTime() + azar() * (hoy - inicioMes));
  leads.push({ id: uid(), nombre: elegir(NOMBRES), telefono: '', pais: azar() < 0.6 ? 'UY' : 'AR',
    capital: elegir(['sin_capital', 'menos_1500', '1500_3000', 'mas_3000']), estado: elegir(['calificado', 'calificado', 'nutrir', 'agendado', 'descartado']),
    setter_id: 'gabo', notas: '', creado: d.toISOString() });
}
leads.sort((a, b) => b.creado.localeCompare(a.creado));

function nuevoPago(p) {
  const pct = metodos.find((m) => m.id === Number(p.metodo_id))?.comision_pct ?? 0;
  return { id: uid(), estado: 'informado', ...p, comision_metodo_pct: pct, neto: Math.round(p.monto * (1 - pct / 100) * 100) / 100 };
}

let yo = new URLSearchParams(location.search).get('como') ?? 'damian';
const espera = () => new Promise((r) => setTimeout(r, 150));
const cambios = [];
const avisar = () => cambios.forEach((cb) => cb());

export const verComo = (id) => { yo = id; };
export const usuarioActual = async () => ({ id: yo, email: perfiles.find((p) => p.id === yo).email });
export const alCambiarSesion = () => {};
export const entrar = async () => {};
export const salir = async () => {};
export const escucharCambios = (cb) => cambios.push(cb);

export async function cargar() {
  await espera();
  const perfil = perfiles.find((p) => p.id === yo);
  return structuredClone({
    perfil, perfiles, config, ofertas, metodos, agendas: agendas.filter((a) => !a.excluida), leads, ventas, pagos, metaGasto, historico,
    costosFijos: perfil.rol === 'admin' ? costosFijos : [],
    configPrivada: perfil.rol === 'admin' ? configPrivada : null,
    gastos: perfil.rol === 'admin' ? gastos : [],
  });
}

export async function guardarResultado(id, c) { Object.assign(agendas.find((a) => a.id === id), c); avisar(); }
export async function crearLead(l) { leads.unshift({ id: uid(), setter_id: yo, creado: new Date().toISOString(), ...l }); avisar(); }
export async function actualizarLead(id, c) { Object.assign(leads.find((l) => l.id === id), c); avisar(); }
export async function crearVenta({ venta, pago, agendaId }) {
  const v = { id: uid(), closer_id: yo, ...venta };
  ventas.unshift(v);
  if (pago) pagos.unshift(nuevoPago({ ...pago, venta_id: v.id, informado_por: yo }));
  if (agendaId) agendas.find((a) => a.id === agendaId).resultado = 'compro';
  avisar();
}
export async function crearPago(p) { pagos.unshift(nuevoPago({ ...p, informado_por: yo })); avisar(); }
export async function revisarPago(id, estado) { Object.assign(pagos.find((p) => p.id === id), { estado, revisado_por: yo }); avisar(); }
export async function guardarConfig(c) { Object.assign(config, c); avisar(); }
export async function guardarConfigPrivada(c) { Object.assign(configPrivada, c); avisar(); }
const TABLAS = { ofertas, metodos_pago: metodos, costos_fijos: costosFijos, gastos };
export async function guardarFila(tabla, fila) {
  const t = TABLAS[tabla];
  if (fila.id) Object.assign(t.find((x) => x.id === fila.id), fila);
  else t.push({ id: Math.max(0, ...t.map((x) => x.id)) + 1, activo: true, activa: true, ...fila });
  avisar();
}
export async function borrarFila(tabla, id) { const t = TABLAS[tabla]; t.splice(t.findIndex((x) => x.id === id), 1); avisar(); }
export async function cambiarRol(id, rol) { perfiles.find((p) => p.id === id).rol = rol; avisar(); }
export async function equipo(accion, { email, nombre, rol, id }) {
  if (accion === 'invitar') perfiles.push({ id: uid(), email, nombre, rol, activo: true, dueno: false });
  else perfiles.find((p) => p.id === id).activo = accion === 'reactivar';
  avisar();
}
export async function sincronizar() { await espera(); return { meta: 'demo', calendly: 'demo' }; }
export async function activarAviso() { await espera(); return { calendly: 'demo' }; }
