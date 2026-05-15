# Despliegue a producción

Este proyecto se despliega en **dos servicios separados** porque el worker
de Playwright necesita un proceso de larga duración con Chromium instalado,
algo incompatible con el modelo serverless de Vercel.

| Pieza        | Provider | Build                              |
|--------------|----------|------------------------------------|
| Frontend + API Routes | Vercel   | `next build`                       |
| Worker BullMQ + Playwright | Railway  | Dockerfile (`mcr.microsoft.com/playwright`) |
| Cola Redis   | Upstash  | Base de datos serverless           |
| DB + Auth + Storage | Supabase | Proyecto remoto                    |

---

## 1. Supabase (DB + Auth + Storage)

1. Crear un proyecto nuevo en https://supabase.com.
2. Aplicar las migraciones de `supabase/migrations/` en orden, desde el editor
   SQL o con `supabase db push` si usás la CLI.
3. Crear el bucket `screenshots` en Storage. Política de acceso pública para
   `select`, escritura restringida al `service_role`.
4. Copiar a un lado:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`
5. En Authentication → URL Configuration, agregar el dominio de Vercel
   (`https://<tu-app>.vercel.app`) a *Site URL* y *Redirect URLs*.

---

## 2. Upstash Redis (cola)

1. Crear una base **Redis** (no "Vector", no "QStash") en https://upstash.com.
2. Habilitar TLS.
3. Copiar `UPSTASH_REDIS_URL` y `UPSTASH_REDIS_TOKEN` (sección REST API).

BullMQ requiere conexión Redis nativa (no REST); `lib/queue/connection.ts`
parsea la URL para abrir un socket compatible.

---

## 3. Gemini

1. Generar la clave en https://aistudio.google.com/app/apikey.
2. Guardar como `GEMINI_API_KEY`. **Solo el worker** la usa — nunca con
   prefijo `NEXT_PUBLIC_`.

---

## 4. Vercel (frontend + API Routes)

1. Importar el repo desde el dashboard de Vercel.
2. Framework preset: **Next.js** (autodetectado).
3. En **Environment Variables** agregar:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   UPSTASH_REDIS_URL
   UPSTASH_REDIS_TOKEN
   ```
   `GEMINI_API_KEY` **no va** en Vercel — solo en Railway.
4. Deploy. El archivo `.vercelignore` evita que Vercel intente bundlear
   `worker/` ni Playwright.

---

## 5. Railway (worker)

1. New Project → *Deploy from GitHub repo*.
2. Railway detecta `railway.json` y usa el `Dockerfile`.
3. En **Variables** agregar:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   GEMINI_API_KEY
   UPSTASH_REDIS_URL
   UPSTASH_REDIS_TOKEN
   ```
4. El servicio se queda *idle-pero-vivo* esperando jobs en la cola.
   Recomendado: mínimo 1 GB RAM (Chromium consume ~500 MB por instancia).
5. Sin healthcheck HTTP: el worker no expone puerto. Si Railway pide uno,
   desactivar healthchecks o exponer un endpoint dummy.

---

## 6. Verificar en producción

Checklist post-deploy:

- [ ] Registro de un usuario nuevo desde la URL de Vercel completa el flujo.
- [ ] Un test_run encolado pasa de `pending` → `running` → `completed`
      (mirar logs de Railway).
- [ ] Los screenshots aparecen en el bucket `screenshots` y se renderizan
      en `/dashboard/runs/[id]`.
- [ ] Crear un segundo usuario y confirmar que **no** ve los test_runs del
      primero (RLS).
- [ ] Encolar 6 runs en menos de 60s → el sexto debe responder `429`.

---

## Notas de seguridad

- `.env.local` está en `.gitignore`. Verificá que **no** quedó commiteado
  con `git log --all --full-history -- .env.local`.
- Las claves listadas en este archivo son ejemplos; rotar inmediatamente
  cualquier clave que aparezca en un commit público.
- `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY` nunca pueden tener prefijo
  `NEXT_PUBLIC_`.
