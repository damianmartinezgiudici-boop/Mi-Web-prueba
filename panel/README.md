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
   - SQL Editor → ejecutar en orden todos los archivos de `supabase/migrations/` (0001, 0002…).
   - Authentication → Sign In / Providers → **desactivar "Allow new users to sign up"**.
   - Authentication → URL Configuration → Site URL = `https://panel.amazonelitefba.com`.
2. **Dueño:** Authentication → Users → *Invite user* con el mail de Damián. Después, en el SQL Editor:
   ```sql
   insert into perfiles (id, email, nombre, rol, dueno)
   select id, email, 'Damián', 'admin', true from auth.users where email = '<MAIL DE DAMIÁN>';
   ```
3. **Funciones:** `node scripts/empaquetar.mjs` genera en `supabase/para-pegar/` una versión de un solo archivo de cada
   función, para pegar en Edge Functions → *Deploy a new function* → *Via Editor* con el mismo nombre.
   `calendly-webhook` y `sincronizar` van con *Verify JWT* desactivado (se validan solas por firma o clave); `equipo`, activado.
   Con la terminal: `supabase functions deploy --no-verify-jwt calendly-webhook sincronizar && supabase functions deploy equipo`.
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

5. **Webhook de Calendly:** en el panel, ⚙ Ajustes → Conexiones → *Activar aviso en vivo* (lo registra la función `sincronizar`).
6. **Cron:** ejecutar `supabase/cron.sql` con el proyecto y la clave. Para traer el historial completo de Meta,
   usar ⚙ Ajustes → Conexiones → *Traer últimos 45 días*.
7. **Web (publicado en https://panel-amazon-elite.damianmartinezgiudici.workers.dev):** completar `web/config.js` con la URL del proyecto y la clave `anon` (es pública; lo que protege
   los datos son los permisos de la base). Subir la carpeta `web/` a Cloudflare Pages.
8. **Dominio:** en GoDaddy, crear un registro CNAME `panel` → `<proyecto>.pages.dev`, y agregar el dominio en Cloudflare Pages.
9. **Equipo:** desde el panel, ⚙ Ajustes → Equipo → invitar por mail con su rol.

## Página de anuncios (admin y socios)

Botón **📣 Anuncios** en el encabezado. Muestra inversión, costo por agenda, costo por venta y retorno, y una tabla
anuncio por anuncio (solo campañas `EVG-`) con una sugerencia: Escalar, Mantener, Revisar o Juntando datos.

- **Gasto por anuncio:** lo trae `sincronizar` de Meta (tablas `anuncios` y `meta_anuncios`).
- **De qué anuncio vino cada agenda:**
  - Anuncios a WhatsApp o Instagram: Gabo elige el anuncio al cargar el lead. La agenda se une al lead por el WhatsApp.
  - Anuncios a la web: el link de Calendly tiene que llevar `utm_content={{ad.id}}`. En Meta se configura en el anuncio, en *Parámetros de URL*.
- **Imagen y estado de cada anuncio:** también los trae `sincronizar` (migración 0007).
- **Para activarla:** pegar `supabase/migrations/0006_anuncios.sql` y `0007_anuncios_imagen.sql`, y después volver a pegar `sincronizar` y `calendly-webhook`, en ese orden.
