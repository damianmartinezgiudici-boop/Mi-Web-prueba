-- Imagen de referencia y estado (activo / pausado) de cada anuncio, para la tabla de la página "Anuncios".
alter table anuncios add column if not exists imagen text;
alter table anuncios add column if not exists estado text;
