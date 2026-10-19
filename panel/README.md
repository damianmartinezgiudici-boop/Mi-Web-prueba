# Panel Amazon Elite

App interna del equipo: ventas del mes, embudo hacia atrás para llegar a la meta, llamadas,
cobros en cuotas, leads de WhatsApp y un bloque privado de ganancias que solo ve el admin dueño.

- **Costo mensual: USD 0.** Supabase (plan gratis) y Cloudflare Pages (gratis con uso comercial).
- **Acceso solo por invitación.** Nadie se puede registrar. El admin invita, cambia roles y quita accesos.
- **En vivo.** Las agendas de Calendly entran al instante. Meta se actualiza cada hora. Lo que carga el equipo aparece en las pantallas de todos sin recargar.

## Roles

| Rol | Qué puede hacer |
|---|---|
| Admin | Todo: ajustes, equipo, confirmar pagos, ver ganancias |
| Socio | Lo mismo que closer y setter. No cobra comisión y no ve ganancias. Su % de la ganancia neta lo ve solo el admin |
| Closer | Cargar resultado de llamadas, ventas y pagos (los pagos quedan "por confirmar"). Cobra comisión sobre lo que entra |
| Setter | Cargar y actualizar sus leads |

El dueño (`perfiles.dueno = true`) no puede ser desactivado ni degradado por nadie.
Toda alta, cambio o baja queda en la tabla `auditoria`.

## Estructura

```
web/                      la app (HTML + JS, sin compilación)
  config.js               URL y clave pública de Supabase (vacío = modo demo)
  calculos.js             métricas puras (probadas en tests/)
  api.js / api-demo.js    acceso a datos real / demo
supabase/migrations/      tablas, permisos (RLS), auditoría y datos iniciales
supabase/functions/
  calendly-webhook        recibe agendas nuevas/canceladas (firma verificada)
  sincronizar             gasto de Meta por país + repaso de Calendly (cron cada hora)
  equipo                  invitar / quitar / reactivar (solo admin)
supabase/cron.sql         programa la sincronización
tests/                    pruebas de permisos, lógica y cálculos
```

## Probar en la compu

```bash
cd web && python3 -m http.server 8765    # abrir http://localhost:8765 (modo demo)
node --test tests/calculos.test.mjs
node --experimental-strip-types --test tests/logica.test.ts
```

## Instalación (una sola vez)

1. **Supabase** (supabase.com, plan gratis): crear el proyecto en la región São Paulo.
   - SQL Editor → ejecutar `supabase/migrations/0001_panel.sql`.
   - Authentication → Sign In / Providers → **desactivar "Allow new users to sign up"**.
   - Authentication → URL Configuration → Site URL = `https://panel.amazonelitefba.com`.
2. **Dueño:** Authentication → Users → *Invite user* con el mail de Damián. Después, en el SQL Editor:
   ```sql
   insert into perfiles (id, email, nombre, rol, dueno)
   select id, email, 'Damián', 'admin', true from auth.users where email = '<MAIL DE DAMIÁN>';
   ```
3. **Funciones:** crear `calendly-webhook` (con *Verify JWT* desactivado), `sincronizar` y `equipo`.
   El código está en `supabase/functions` y las dos primeras usan `_shared`.
   Desde la terminal: `supabase functions deploy --no-verify-jwt calendly-webhook && supabase functions deploy sincronizar equipo`.
4. **Secretos** (Edge Functions → Secrets):

   | Nombre | Valor |
   |---|---|
   | `PANEL_URL` | `https://panel.amazonelitefba.com` |
   | `META_TOKEN` | token de usuario del sistema de Meta, solo lectura (`ads_read`) |
   | `META_ACCOUNT_ID` | `1035525935470332` |
   | `CALENDLY_TOKEN` | token personal de Calendly |
   | `CALENDLY_SIGNING_KEY` | clave inventada, la misma que se usa al crear el webhook |
   | `CALENDLY_EVENT_TYPE` | `7eae1a49-37f1-4266-8360-ec8915555cc5` (llamada de auditoría) |
   | `SINCRONIZAR_CLAVE` | clave inventada para el cron |

5. **Webhook de Calendly** (una vez):
   ```bash
   curl -X POST https://api.calendly.com/webhook_subscriptions \
     -H "Authorization: Bearer $CALENDLY_TOKEN" -H "Content-Type: application/json" \
     -d '{"url":"https://<PROYECTO>.supabase.co/functions/v1/calendly-webhook",
          "events":["invitee.created","invitee.canceled"],
          "organization":"https://api.calendly.com/organizations/7cc52666-0d60-4e15-a234-7479fa4d33b6",
          "user":"https://api.calendly.com/users/8c66dc54-728b-4b47-8683-47fd79f112b8",
          "scope":"user","signing_key":"<CALENDLY_SIGNING_KEY>"}'
   ```
6. **Cron:** ejecutar `supabase/cron.sql` con el proyecto y la clave. Para traer el historial completo de Meta,
   tocar una vez ↻ en el panel o llamar a `sincronizar` con `{"dias": 120}`.
7. **Web:** completar `web/config.js` con la URL del proyecto y la clave `anon` (es pública; lo que protege
   los datos son los permisos de la base). Subir la carpeta `web/` a Cloudflare Pages.
8. **Dominio:** en GoDaddy, crear un registro CNAME `panel` → `<proyecto>.pages.dev`, y agregar el dominio en Cloudflare Pages.
9. **Equipo:** desde el panel, ⚙ Ajustes → Equipo → invitar por mail con su rol.
