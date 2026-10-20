// Corre cada hora (cron) o desde el botón "Actualizar" del admin.
// Trae el gasto de Meta por país y día, y repasa las agendas de Calendly por si se perdió algún aviso.
import { servicio, adminQueLlama, json, CORS } from '../_shared/supabase.ts';
import { agendaDesdeCalendly, gastoDesdeMeta, anuncioDesdeMeta, estadoAnuncio } from '../_shared/logica.ts';

const META = 'https://graph.facebook.com/v21.0';
const CAL = 'https://api.calendly.com';

const dia = (d: Date) => d.toISOString().slice(0, 10);

async function sincronizarMeta(db: ReturnType<typeof servicio>, desde: string, hasta: string) {
  const token = Deno.env.get('META_TOKEN'), cuenta = Deno.env.get('META_ACCOUNT_ID');
  if (!token || !cuenta) return 'Meta sin configurar';
  const filas: any[] = [];
  // Solo campañas cuyo nombre contiene el prefijo (EVG-): el lanzamiento y otras pruebas no se mezclan.
  const prefijo = Deno.env.get('META_PREFIJO_CAMPANAS') ?? 'EVG-';
  let url: string | null = `${META}/act_${cuenta}/insights?` + new URLSearchParams({
    level: 'campaign', breakdowns: 'country', time_increment: '1', limit: '500',
    time_range: JSON.stringify({ since: desde, until: hasta }),
    filtering: JSON.stringify(prefijo ? [{ field: 'campaign.name', operator: 'CONTAIN', value: prefijo }] : []),
    fields: 'spend,actions', access_token: token,
  });
  const porDiaPais = new Map<string, ReturnType<typeof gastoDesdeMeta>>();
  while (url) {
    const r: Response = await fetch(url);
    const j: any = await r.json();
    if (!r.ok) throw new Error('Meta: ' + (j.error?.message ?? r.status));
    for (const g of j.data.map(gastoDesdeMeta)) {
      const k = `${g.fecha}|${g.pais}`;
      const prev = porDiaPais.get(k);
      porDiaPais.set(k, prev ? { ...prev, gasto: prev.gasto + g.gasto, conversaciones: prev.conversaciones + g.conversaciones } : g);
    }
    url = j.paging?.next ?? null;
  }
  filas.push(...porDiaPais.values());
  if (filas.length) {
    const { error } = await db.from('meta_gasto').upsert(filas);
    if (error) throw error;
  }
  return `${filas.length} filas de Meta`;
}

/** Gasto por anuncio y día (página "Anuncios"). Mismo filtro de campañas que el gasto general. */
async function sincronizarAnuncios(db: ReturnType<typeof servicio>, desde: string, hasta: string) {
  const token = Deno.env.get('META_TOKEN'), cuenta = Deno.env.get('META_ACCOUNT_ID');
  if (!token || !cuenta) return 'Meta sin configurar';
  const prefijo = Deno.env.get('META_PREFIJO_CAMPANAS') ?? 'EVG-';
  let url: string | null = `${META}/act_${cuenta}/insights?` + new URLSearchParams({
    level: 'ad', time_increment: '1', limit: '500',
    time_range: JSON.stringify({ since: desde, until: hasta }),
    filtering: JSON.stringify(prefijo ? [{ field: 'campaign.name', operator: 'CONTAIN', value: prefijo }] : []),
    fields: 'ad_id,ad_name,campaign_name,spend,actions,inline_link_clicks', access_token: token,
  });
  const anuncios = new Map<string, any>(), dias: any[] = [];
  while (url) {
    const r: Response = await fetch(url);
    const j: any = await r.json();
    if (!r.ok) throw new Error('Meta: ' + (j.error?.message ?? r.status));
    for (const { anuncio, dia: d } of j.data.map(anuncioDesdeMeta)) {
      const prev = anuncios.get(anuncio.id);
      const ultimo = d.gasto > 0 && (!prev?.ultimo_gasto || d.fecha > prev.ultimo_gasto) ? d.fecha : prev?.ultimo_gasto ?? null;
      anuncios.set(anuncio.id, { ...anuncio, ultimo_gasto: ultimo });
      dias.push(d);
    }
    url = j.paging?.next ?? null;
  }
  if (anuncios.size) {
    // Imagen de referencia y estado de cada anuncio. Si Meta no los da, se guarda igual el gasto.
    try { await imagenesDeAnuncios(token, cuenta, anuncios); } catch (e) { console.error('imágenes de anuncios', e); }
    // No pisar un último gasto más nuevo que ya estaba guardado.
    const { data: guardados } = await db.from('anuncios').select('id, ultimo_gasto').in('id', [...anuncios.keys()]);
    for (const g of guardados ?? []) {
      const a = anuncios.get(g.id);
      if (g.ultimo_gasto && (!a.ultimo_gasto || g.ultimo_gasto > a.ultimo_gasto)) a.ultimo_gasto = g.ultimo_gasto;
    }
    const { error } = await db.from('anuncios').upsert([...anuncios.values()]);
    if (error) throw error;
    const { error: e2 } = await db.from('meta_anuncios').upsert(dias);
    if (e2) throw e2;
  }
  return `${anuncios.size} anuncios, ${dias.length} filas`;
}

/** Miniatura y estado de cada anuncio, de a 50 por pedido. Primero en 160 px; si Meta no acepta el tamaño, la de siempre. */
async function imagenesDeAnuncios(token: string, cuenta: string, anuncios: Map<string, any>) {
  const ids = [...anuncios.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const pedir = (creative: string) => fetch(`${META}/act_${cuenta}/ads?` + new URLSearchParams({
      fields: `id,effective_status,${creative}`, limit: '50', access_token: token,
      filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: ids.slice(i, i + 50) }]),
    }));
    let r = await pedir('creative.thumbnail_width(160).thumbnail_height(160){thumbnail_url,image_url}');
    if (!r.ok) r = await pedir('creative{thumbnail_url,image_url}');
    const j: any = await r.json();
    if (!r.ok) throw new Error('Meta: ' + (j.error?.message ?? r.status));
    for (const ad of j.data ?? []) {
      const a = anuncios.get(String(ad.id));
      if (a) Object.assign(a, { imagen: ad.creative?.image_url ?? ad.creative?.thumbnail_url ?? null, estado: estadoAnuncio(ad.effective_status) });
    }
  }
}

async function cal(path: string, token: string) {
  const r = await fetch(path.startsWith('http') ? path : CAL + path, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok) throw new Error('Calendly: ' + (j.message ?? r.status));
  return j;
}

async function sincronizarCalendly(db: ReturnType<typeof servicio>, desde: Date, forzar = false) {
  const token = Deno.env.get('CALENDLY_TOKEN');
  if (!token) return 'Calendly sin configurar';
  const tipo = Deno.env.get('CALENDLY_EVENT_TYPE');
  const yo = (await cal('/users/me', token)).resource.uri;
  const { data: config } = await db.from('config').select('capital_minimo').single();
  const minimo = Number(config?.capital_minimo ?? 1500);

  const eventos: any[] = [];
  let url: string | null = '/scheduled_events?' + new URLSearchParams({
    user: yo, min_start_time: desde.toISOString(), count: '100', sort: 'start_time:asc',
  });
  while (url) {
    const j: any = await cal(url, token);
    eventos.push(...j.collection.filter((e: any) => !tipo || String(e.event_type).endsWith(tipo)));
    url = j.pagination?.next_page ?? null;
  }

  // Solo se piden los invitados de eventos nuevos o que cambiaron de estado.
  const ids = eventos.map((e) => String(e.uri).split('/').pop());
  const { data: conocidas } = await db.from('agendas').select('evento_id, estado').in('evento_id', ids);
  const estado = new Map((conocidas ?? []).map((a) => [a.evento_id, a.estado]));
  let n = 0;
  for (const e of eventos) {
    const id = String(e.uri).split('/').pop();
    const esperado = e.status === 'canceled' ? 'cancelada' : 'activa';
    if (!forzar && estado.get(id) === esperado) continue;
    const inv = await cal(`${e.uri}/invitees?count=100`, token);
    const filas = inv.collection.map((i: any) => agendaDesdeCalendly(i, e, minimo));
    if (filas.length) {
      const { error } = await db.from('agendas').upsert(filas);
      if (error) throw error;
      n += filas.length;
    }
  }
  return `${eventos.length} eventos de Calendly, ${n} agendas actualizadas`;
}

/** Registra el aviso (webhook) de Calendly hacia la función calendly-webhook. Si ya existe, no hace nada. */
async function activarAvisoCalendly() {
  const token = Deno.env.get('CALENDLY_TOKEN'), clave = Deno.env.get('CALENDLY_SIGNING_KEY');
  if (!token || !clave) return 'Faltan CALENDLY_TOKEN o CALENDLY_SIGNING_KEY';
  const yo = (await cal('/users/me', token)).resource;
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendly-webhook`;
  const existentes = await cal('/webhook_subscriptions?' + new URLSearchParams({
    organization: yo.current_organization, user: yo.uri, scope: 'user',
  }), token);
  if (existentes.collection.some((w: any) => w.callback_url === url && w.state === 'active')) return 'El aviso ya estaba activo';
  const r = await fetch(CAL + '/webhook_subscriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, events: ['invitee.created', 'invitee.canceled'], organization: yo.current_organization,
      user: yo.uri, scope: 'user', signing_key: clave }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Calendly: ' + (j.message ?? r.status));
  return 'Aviso de Calendly activado';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const porCron = req.headers.get('x-clave') === Deno.env.get('SINCRONIZAR_CLAVE');
  if (!porCron && !(await adminQueLlama(req))) return json({ error: 'sin permiso' }, 403);

  const params = await req.json().catch(() => ({}));
  if (params.accion === 'activar-aviso') {
    try { return json({ calendly: await activarAvisoCalendly() }); }
    catch (e) { return json({ error: (e as Error).message }, 400); }
  }
  const dias = Math.min(Number(params.dias ?? 3), 400);
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - dias * 86400000);
  const db = servicio();
  const resultado: Record<string, string> = {};
  for (const [nombre, tarea] of [
    ['meta', () => sincronizarMeta(db, dia(desde), dia(hoy))],
    ['anuncios', () => sincronizarAnuncios(db, dia(desde), dia(hoy))],
    ['calendly', () => sincronizarCalendly(db, desde, !!params.forzar)],
  ] as const) {
    try { resultado[nombre] = await tarea(); }
    catch (e) { resultado[nombre] = 'ERROR: ' + (e as Error).message; }
  }
  return json(resultado);
});
