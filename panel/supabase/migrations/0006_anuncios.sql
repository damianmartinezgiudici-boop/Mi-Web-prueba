-- Página "Anuncios": gasto de Meta por anuncio y de qué anuncio vino cada lead y cada agenda.

-- Lista de anuncios (la llena la sincronización). La lee todo el equipo: Gabo elige de acá al cargar un lead.
create table anuncios (
  id           text primary key,            -- id del anuncio en Meta
  nombre       text not null,
  campana      text,
  ultimo_gasto date
);

-- Gasto y resultados por anuncio y día. Solo lo ven el admin y los socios.
create table meta_anuncios (
  fecha          date not null,
  anuncio_id     text not null references anuncios (id) on delete cascade,
  gasto          numeric(12,2) not null default 0,
  conversaciones int not null default 0,      -- mensajes iniciados (WhatsApp, Instagram, Messenger)
  clics          int not null default 0,      -- clics al link (anuncios a la web)
  primary key (fecha, anuncio_id)
);
create index on meta_anuncios (fecha);

-- De dónde vino cada lead (lo marca Gabo) y cada agenda (por el UTM del link de Calendly).
alter table leads add column canal text check (canal in ('whatsapp', 'instagram', 'web', 'organico'));
alter table leads add column anuncio_id text references anuncios (id) on delete set null;
alter table agendas add column anuncio_id text;

alter table anuncios      enable row level security;
alter table meta_anuncios enable row level security;
create policy leer on anuncios      for select using (es_miembro());
create policy leer on meta_anuncios for select using (es_admin() or mi_rol() = 'socio');
