-- Comisión del setter: un % de todo lo que entra neto (de cualquier venta, la cierre quien la cierre).
alter table config add column comision_setter_pct numeric(5,2) not null default 0;
update config set comision_setter_pct = 5;
