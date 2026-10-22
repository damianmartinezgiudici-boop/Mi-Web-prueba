-- "Lo piensa": cuándo volver a contactar a la persona. Lo carga el closer al elegir ese resultado.
alter table agendas add column if not exists seguimiento date;
