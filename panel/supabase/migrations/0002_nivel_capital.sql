-- Tres niveles de capital: no (rojo), medio (amarillo, puede entrar con seña), califica (verde).
alter table agendas add column nivel text not null default 'no' check (nivel in ('califica', 'medio', 'no'));
update agendas set nivel = 'califica' where calificada;

-- Leads de WhatsApp: se suma la opción "sin capital".
alter table leads drop constraint leads_capital_check;
alter table leads add constraint leads_capital_check check (capital in ('sin_capital', 'menos_1500', '1500_3000', 'mas_3000'));

-- El closer no puede cambiar el nivel a mano.
create or replace function limitar_agenda() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not es_admin() then
    if (new.id, new.evento_id, new.nombre, new.email, new.telefono, new.pais, new.capital,
        new.calificada, new.nivel, new.inicio, new.estado)
       is distinct from
       (old.id, old.evento_id, old.nombre, old.email, old.telefono, old.pais, old.capital,
        old.calificada, old.nivel, old.inicio, old.estado) then
      raise exception 'Solo se puede cambiar el resultado y las notas de la llamada';
    end if;
  end if;
  new.actualizado := now();
  return new;
end $$;
