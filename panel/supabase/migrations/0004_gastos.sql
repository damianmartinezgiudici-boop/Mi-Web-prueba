-- Gastos sueltos del mes (comisiones pagadas aparte, editores, herramientas…). Solo el admin.
-- A diferencia de los costos fijos, cada gasto se resta solo del mes de su fecha.
create table gastos (
  id       serial primary key,
  fecha    date not null default current_date,
  concepto text not null,
  tipo     text not null default 'extra' check (tipo in ('comision', 'extra')),
  monto    numeric(10,2) not null check (monto > 0),
  creado   timestamptz not null default now()
);

alter table gastos enable row level security;
create policy admin on gastos for all using (es_admin()) with check (es_admin());

create trigger gastos_auditar after insert or update or delete on gastos
  for each row execute function auditar();
