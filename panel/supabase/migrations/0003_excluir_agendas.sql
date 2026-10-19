-- Agendas de prueba: quedan en Calendly pero no cuentan en el panel. Solo el admin las excluye.
alter table agendas add column excluida boolean not null default false;

create or replace function limitar_agenda() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not es_admin() then
    if (new.id, new.evento_id, new.nombre, new.email, new.telefono, new.pais, new.capital,
        new.calificada, new.nivel, new.inicio, new.estado, new.excluida)
       is distinct from
       (old.id, old.evento_id, old.nombre, old.email, old.telefono, old.pais, old.capital,
        old.calificada, old.nivel, old.inicio, old.estado, old.excluida) then
      raise exception 'Solo se puede cambiar el resultado y las notas de la llamada';
    end if;
  end if;
  new.actualizado := now();
  return new;
end $$;

update agendas set excluida = true where email = 'noboagabriel@icloud.com';
