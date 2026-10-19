\set ON_ERROR_STOP 0
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;

insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','damian@x.com'),
 ('00000000-0000-0000-0000-00000000000b','ramiro@x.com'),
 ('00000000-0000-0000-0000-00000000000c','gabo@x.com'),
 ('00000000-0000-0000-0000-00000000000d','extrano@x.com');
insert into perfiles (id,email,nombre,rol,dueno) values
 ('00000000-0000-0000-0000-00000000000a','damian@x.com','Damián','admin',true),
 ('00000000-0000-0000-0000-00000000000b','ramiro@x.com','Ramiro','closer',false),
 ('00000000-0000-0000-0000-00000000000c','gabo@x.com','Gabo','setter',false);
insert into agendas (id,nombre,inicio,pais,calificada) values ('inv1','Lucía',now(),'UY',true);

\echo '== EXTRAÑO (sin perfil): no ve nada'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select count(*) as agendas_vistas from agendas;
select count(*) as config_vista from config;
insert into leads (nombre) values ('hack');

\echo '== GABO (setter)'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select count(*) as costos_vistos from costos_fijos;
insert into leads (nombre,capital) values ('Lead de Gabo','1500_3000');
select count(*) as leads from leads;
update agendas set resultado='compro' where id='inv1';
select resultado as resultado_sin_cambio from agendas;
insert into ventas (cliente,precio) values ('x',950);

\echo '== RAMIRO (closer)'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update agendas set resultado='compro' where id='inv1';
update agendas set calificada=false where id='inv1';
insert into ventas (id,agenda_id,cliente,oferta_id,precio) values ('11111111-1111-1111-1111-111111111111','inv1','Lucía',2,1850);
insert into pagos (venta_id,monto,metodo_id,estado) values ('11111111-1111-1111-1111-111111111111',1850,3,'recibido');
select monto, comision_metodo_pct, neto, estado from pagos;
update pagos set estado='recibido';
update perfiles set rol='admin' where email='ramiro@x.com';
select rol from perfiles where email='ramiro@x.com';
select count(*) as auditoria_vista from auditoria;

\echo '== DAMIÁN (admin)'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update pagos set estado='recibido';
select estado, revisado_por is not null as con_revisor, revisado_en is not null as con_fecha from pagos;
select count(*) as costos from costos_fijos;
update perfiles set activo=false where email='damian@x.com';
update perfiles set activo=false where email='ramiro@x.com';

\echo '== RAMIRO desactivado: ya no ve nada'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select count(*) as agendas_vistas from agendas;

\echo '== Auditoría'
reset role;
select tabla, accion, count(*) from auditoria group by 1,2 order by 1,2;
