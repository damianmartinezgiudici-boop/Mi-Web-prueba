-- Panel Amazon Elite: esquema, permisos (RLS) y auditoría.
-- Se ejecuta una sola vez en el SQL Editor de Supabase.

create extension if not exists pgcrypto;

-- ───────────────────────── Equipo y roles ─────────────────────────

-- socio: hace lo mismo que closer y setter, sin ver ganancias.
create type rol as enum ('admin', 'socio', 'closer', 'setter');

create table perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  email   text not null unique,
  nombre  text not null default '',
  rol     rol  not null default 'setter',
  activo  boolean not null default true,
  dueno   boolean not null default false,   -- Damián: nadie le puede quitar el acceso ni el rol
  creado  timestamptz not null default now()
);

create function mi_rol() returns rol
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

create function es_miembro() returns boolean
language sql stable as $$ select mi_rol() is not null $$;

create function es_admin() returns boolean
language sql stable as $$ select coalesce(mi_rol() = 'admin', false) $$;

-- El perfil del dueño no se puede desactivar, degradar ni borrar.
create function proteger_dueno() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.dueno then raise exception 'El perfil del dueño no se puede borrar'; end if;
    return old;
  end if;
  if old.dueno and (not new.activo or new.rol <> 'admin' or not new.dueno) then
    raise exception 'El perfil del dueño no se puede desactivar ni cambiar de rol';
  end if;
  if new.dueno and not old.dueno and auth.uid() is not null then
    raise exception 'Solo se puede marcar al dueño desde la instalación';
  end if;
  return new;
end $$;

create trigger perfiles_dueno before update or delete on perfiles
for each row execute function proteger_dueno();

-- ───────────────────────── Configuración ─────────────────────────

create table ofertas (
  id      serial primary key,
  nombre  text not null unique,
  precio  numeric(10,2) not null check (precio > 0),
  activa  boolean not null default true
);

create table metodos_pago (
  id            serial primary key,
  nombre        text not null unique,
  comision_pct  numeric(5,2) not null default 0 check (comision_pct >= 0 and comision_pct < 100),
  activo        boolean not null default true
);

-- Una sola fila con metas y supuestos de la calculadora.
create table config (
  id                    int primary key default 1 check (id = 1),
  meta_base             numeric(12,2) not null default 30000,
  meta_objetivo         numeric(12,2) not null default 40000,
  meta_record           numeric(12,2) not null default 50000,
  comision_closer_pct   numeric(5,2)  not null default 10,
  capital_minimo        numeric(12,2) not null default 1500,
  sup_ticket            numeric(10,2) not null default 1530,
  sup_cierre_pct        numeric(5,2)  not null default 30,
  sup_presentan_pct     numeric(5,2)  not null default 75,
  sup_calificadas_pct   numeric(5,2)  not null default 60,
  sup_lead_agenda_pct   numeric(5,2)  not null default 5,
  sup_costo_agenda      numeric(10,2) not null default 35
);

-- ───────────────────────── Operación ─────────────────────────

create table agendas (
  id          text primary key,                 -- id del invitado en Calendly
  evento_id   text,
  nombre      text not null default '',
  email       text,
  telefono    text,
  pais        text,                             -- UY, AR, ... (por el código del WhatsApp)
  capital     text,                             -- respuesta tal cual
  calificada  boolean not null default false,
  inicio      timestamptz not null,
  estado      text not null default 'activa' check (estado in ('activa', 'cancelada')),
  resultado   text not null default 'pendiente'
              check (resultado in ('pendiente', 'no_se_presento', 'no_compro', 'seguimiento', 'compro')),
  closer_id   uuid references perfiles (id),
  notas       text,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index on agendas (inicio);

create table leads (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  telefono  text,
  pais      text,
  capital   text check (capital in ('menos_1500', '1500_3000', 'mas_3000')),
  estado    text not null default 'calificado' check (estado in ('calificado', 'nutrir', 'agendado', 'descartado')),
  setter_id uuid references perfiles (id) default auth.uid(),
  notas     text,
  creado    timestamptz not null default now()
);
create index on leads (creado);

create table ventas (
  id         uuid primary key default gen_random_uuid(),
  agenda_id  text references agendas (id) on delete set null,
  cliente    text not null,
  pais       text,
  oferta_id  int references ofertas (id),
  precio     numeric(10,2) not null check (precio > 0),
  closer_id  uuid references perfiles (id) default auth.uid(),
  fecha      date not null default (now() at time zone 'America/Montevideo')::date,
  notas      text,
  creado     timestamptz not null default now()
);
create index on ventas (fecha);

-- Cada pago (seña, cuota o total). Ramiro lo informa; Damián lo marca como recibido.
create table pagos (
  id                   uuid primary key default gen_random_uuid(),
  venta_id             uuid not null references ventas (id) on delete cascade,
  monto                numeric(10,2) not null check (monto > 0),
  metodo_id            int not null references metodos_pago (id),
  comision_metodo_pct  numeric(5,2) not null default 0,
  neto                 numeric(10,2) generated always as (round(monto * (1 - comision_metodo_pct / 100), 2)) stored,
  fecha                date not null default (now() at time zone 'America/Montevideo')::date,
  estado               text not null default 'informado' check (estado in ('informado', 'recibido', 'rechazado')),
  informado_por        uuid references perfiles (id) default auth.uid(),
  revisado_por         uuid references perfiles (id),
  revisado_en          timestamptz,
  creado               timestamptz not null default now()
);
create index on pagos (fecha);

-- Gasto de Meta por día y país (lo llena la sincronización).
create table meta_gasto (
  fecha           date not null,
  pais            text not null,
  gasto           numeric(10,2) not null default 0,
  conversaciones  int not null default 0,
  primary key (fecha, pais)
);

-- Meses anteriores al panel (julio a octubre 2026), para los gráficos.
create table historico (
  mes        date primary key,   -- primer día del mes
  cobrado    numeric(12,2) not null default 0,
  ventas_uy  int not null default 0,
  ventas_ar  int not null default 0,
  gasto_meta numeric(12,2) not null default 0,
  agendas    int not null default 0
);

-- Solo el admin: reparto de la ganancia neta con el socio.
create table config_privada (
  id         int primary key default 1 check (id = 1),
  socio_pct  numeric(5,2) not null default 0 check (socio_pct >= 0 and socio_pct <= 100)
);

-- Solo el admin: costos fijos para calcular la ganancia.
create table costos_fijos (
  id       serial primary key,
  concepto text not null,
  monto    numeric(10,2) not null check (monto >= 0),
  activo   boolean not null default true
);

-- ───────────────────────── Reglas de negocio ─────────────────────────

-- La comisión del método se copia al cargar el pago (si después cambia, los pagos viejos no se tocan).
-- Quien no es admin solo puede informar pagos; marcar recibido/rechazado es del admin.
create function preparar_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select comision_pct into new.comision_metodo_pct from metodos_pago where id = new.metodo_id;
  elsif new.metodo_id <> old.metodo_id then
    select comision_pct into new.comision_metodo_pct from metodos_pago where id = new.metodo_id;
  end if;

  if auth.uid() is not null and not es_admin() then
    if tg_op = 'INSERT' then
      new.estado := 'informado';
      new.revisado_por := null;
      new.revisado_en := null;
    elsif old.estado <> 'informado' then
      raise exception 'Este pago ya fue revisado: solo el admin lo puede cambiar';
    elsif new.estado <> 'informado' or new.revisado_por is distinct from old.revisado_por then
      raise exception 'Solo el admin puede marcar un pago como recibido';
    end if;
  elsif tg_op = 'UPDATE' and new.estado <> old.estado then
    new.revisado_por := auth.uid();
    new.revisado_en := now();
  end if;
  return new;
end $$;

create trigger pagos_preparar before insert or update on pagos
for each row execute function preparar_pago();

-- Closers y setters solo pueden tocar el resultado, el closer y las notas de una agenda.
create function limitar_agenda() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not es_admin() then
    if (new.id, new.evento_id, new.nombre, new.email, new.telefono, new.pais, new.capital,
        new.calificada, new.inicio, new.estado)
       is distinct from
       (old.id, old.evento_id, old.nombre, old.email, old.telefono, old.pais, old.capital,
        old.calificada, old.inicio, old.estado) then
      raise exception 'Solo se puede cambiar el resultado y las notas de la llamada';
    end if;
  end if;
  new.actualizado := now();
  return new;
end $$;

create trigger agendas_limitar before update on agendas
for each row execute function limitar_agenda();

-- ───────────────────────── Auditoría ─────────────────────────

create table auditoria (
  id       bigserial primary key,
  tabla    text not null,
  registro text,
  accion   text not null,
  usuario  uuid,
  antes    jsonb,
  despues  jsonb,
  en       timestamptz not null default now()
);

create function auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fila jsonb := to_jsonb(coalesce(new, old));
begin
  insert into auditoria (tabla, registro, accion, usuario, antes, despues)
  values (tg_table_name, fila ->> 'id', tg_op, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['perfiles', 'ofertas', 'metodos_pago', 'config', 'agendas', 'leads',
                           'ventas', 'pagos', 'costos_fijos', 'historico', 'config_privada']
  loop
    execute format('create trigger %I after insert or update or delete on %I
                    for each row execute function auditar()', t || '_auditar', t);
  end loop;
end $$;

-- ───────────────────────── Permisos (RLS) ─────────────────────────
-- Sin una política que lo permita, nadie lee ni escribe. La sincronización usa la
-- clave de servicio, que no pasa por estas reglas y nunca llega al navegador.

alter table perfiles     enable row level security;
alter table ofertas      enable row level security;
alter table metodos_pago enable row level security;
alter table config       enable row level security;
alter table agendas      enable row level security;
alter table leads        enable row level security;
alter table ventas       enable row level security;
alter table pagos        enable row level security;
alter table meta_gasto   enable row level security;
alter table historico    enable row level security;
alter table costos_fijos enable row level security;
alter table config_privada enable row level security;
alter table auditoria    enable row level security;

-- Todo el equipo activo ve la operación; solo el admin cambia la configuración.
create policy leer on perfiles     for select using (es_miembro());
create policy admin on perfiles    for all using (es_admin()) with check (es_admin());

create policy leer on ofertas      for select using (es_miembro());
create policy admin on ofertas     for all using (es_admin()) with check (es_admin());

create policy leer on metodos_pago for select using (es_miembro());
create policy admin on metodos_pago for all using (es_admin()) with check (es_admin());

create policy leer on config       for select using (es_miembro());
create policy admin on config      for all using (es_admin()) with check (es_admin());

create policy leer on meta_gasto   for select using (es_miembro());
create policy leer on historico    for select using (es_miembro());
create policy admin on historico   for all using (es_admin()) with check (es_admin());

create policy leer on agendas      for select using (es_miembro());
create policy cargar on agendas    for insert with check (es_admin());
create policy resultado on agendas for update using (mi_rol() in ('admin', 'socio', 'closer')) with check (mi_rol() in ('admin', 'socio', 'closer'));
create policy borrar on agendas    for delete using (es_admin());

create policy leer on leads        for select using (es_miembro());
create policy cargar on leads      for insert with check (es_miembro() and (setter_id = auth.uid() or es_admin()));
create policy editar on leads      for update using (setter_id = auth.uid() or es_admin()) with check (es_miembro());
create policy borrar on leads      for delete using (es_admin());

create policy leer on ventas       for select using (es_miembro());
create policy cargar on ventas     for insert with check (mi_rol() in ('admin', 'socio', 'closer'));
create policy editar on ventas     for update using (es_admin() or (mi_rol() in ('socio', 'closer') and closer_id = auth.uid()))
                                   with check (mi_rol() in ('admin', 'socio', 'closer'));
create policy borrar on ventas     for delete using (es_admin());

create policy leer on pagos        for select using (es_miembro());
create policy cargar on pagos      for insert with check (mi_rol() in ('admin', 'socio', 'closer'));
create policy editar on pagos      for update using (es_admin() or (mi_rol() in ('socio', 'closer') and informado_por = auth.uid()))
                                   with check (mi_rol() in ('admin', 'socio', 'closer'));
create policy borrar on pagos      for delete using (es_admin() or (informado_por = auth.uid() and estado = 'informado'));

create policy admin on costos_fijos for all using (es_admin()) with check (es_admin());
create policy admin on config_privada for all using (es_admin()) with check (es_admin());
create policy admin on auditoria   for select using (es_admin());

-- ───────────────────────── Datos iniciales ─────────────────────────

insert into config default values;
insert into config_privada (socio_pct) values (30);   -- Pedro: 30% de la ganancia neta

insert into ofertas (nombre, precio) values ('PRIME', 950), ('VIP', 1850), ('BLACK', 2500);

insert into metodos_pago (nombre, comision_pct) values
  ('Transferencia local', 0),
  ('Transferencia Argentina', 0),
  ('dLocal', 6);

insert into costos_fijos (concepto, monto) values
  ('Empresa', 800),
  ('Equipo de coaches', 1080),
  ('Plataformas (Skool, ManyChat, Calendly, Zoom, verificado IG, otras)', 300);

-- Cash cobrado, ventas por país, gasto en Meta y agendas de jul–oct 2026.
insert into historico (mes, cobrado, ventas_uy, ventas_ar, gasto_meta, agendas) values
  ('2026-07-01', 26340, 20, 1, 3071.05, 146),
  ('2026-08-01', 26192, 11, 6, 4998.64, 132),
  ('2026-09-01', 33095,  8, 10, 5204.30, 73),
  ('2026-10-01',     0,  0, 0, 1817.02, 34);

-- Cambios en vivo: el panel se actualiza solo cuando alguien carga algo.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table agendas, leads, ventas, pagos, meta_gasto;
  end if;
end $$;
