-- Sincronización automática cada hora (Meta + repaso de Calendly).
-- Reemplazá <PROYECTO> y <CLAVE> antes de ejecutar. <CLAVE> es la misma que el secreto SINCRONIZAR_CLAVE.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('sincronizar-panel', '7 * * * *', $$
  select net.http_post(
    url := 'https://<PROYECTO>.supabase.co/functions/v1/sincronizar',
    headers := '{"Content-Type": "application/json", "x-clave": "<CLAVE>"}'::jsonb,
    body := '{"dias": 3}'::jsonb
  );
$$);
