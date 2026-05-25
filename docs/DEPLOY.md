# Despliegue a producción

Este proyecto se despliega en **dos servicios separados** porque el worker de
Playwright necesita un proceso de larga duración con Chromium instalado, algo
incompatible con el modelo serverless de Vercel. El worker es un servidor
Express en Render free tier; la API Route de Vercel lo contacta vía HTTP
autenticada con `WORKER_SECRET`.

| Pieza                       | Provider | Build                                        |
| --------------------------- | -------- | -------------------------------------------- |
| Frontend + API Routes       | Vercel   | `next build`                                 |
| Worker Express + Playwright | Render   | `render.yaml` (Node + `@sparticuz/chromium`) |
| DB + Auth + Storage         | Supabase | Proyecto remoto                              |

---

## 1. Supabase (DB + Auth + Storage)

1. Crear un proyecto nuevo en https://supabase.com.
2. Aplicar las migraciones de `supabase/migrations/` en orden, desde el editor
   SQL o con `supabase db push` si usás la CLI.
3. Crear el bucket `screenshots` en Storage. Política de acceso pública para
   `select`, escritura restringida al `service_role`.
4. Copiar a un lado:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` (Vercel) y `SUPABASE_URL` (Render)
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`
5. En Authentication → URL Configuration, agregar el dominio de Vercel
   (`https://<tu-app>.vercel.app`) a _Site URL_ y _Redirect URLs_.

---

## 2. Gemini

1. Generar la clave en https://aistudio.google.com/app/apikey.
2. Guardar como `GEMINI_API_KEY` **en Render** (worker). Nunca en Vercel ni
   con prefijo `NEXT_PUBLIC_`.

---

## 3. Vercel (frontend + API Routes)

1. Importar el repo desde el dashboard de Vercel.
2. Framework preset: **Next.js** (autodetectado).
3. En **Environment Variables** agregar:
   ```
   NEXT_PUBLIC_SITE_URL       # https://<tu-app>.vercel.app (sin barra final)
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   WORKER_URL                 # https://<tu-worker>.onrender.com
   WORKER_SECRET              # mismo valor que en Render
   ```
   `GEMINI_API_KEY` **no va** en Vercel — solo en Render.
   `NEXT_PUBLIC_SITE_URL` debe coincidir con el dominio de _Redirect URLs_ del
   paso 1; sin él, los emails de confirmación de registro apuntarían a
   `localhost` y romperían el alta en producción.
4. Deploy. El archivo `.vercelignore` evita que Vercel intente bundlear
   `worker/`.

---

## 4. Render (worker)

1. _New → Blueprint_ desde el repo: Render detecta `render.yaml` y crea el
   servicio web `ai-testing-worker` con `rootDir: worker`.
2. En **Environment** agregar:
   ```
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   GEMINI_API_KEY
   WORKER_SECRET              # mismo valor que en Vercel
   ```
3. El plan **free** duerme tras 15 min de inactividad y tarda ~30-50 s en
   despertar (cold start). La API Route de Vercel usa `after()` con un
   timeout de 55 s para tolerarlo; si la primera llamada falla, el run se
   marca como `fallido` con un mensaje claro y el usuario puede reintentar.
4. Healthcheck: `GET /health` (declarado en `render.yaml`).

---

## 5. Verificar en producción

Checklist post-deploy:

- [ ] `GET {WORKER_URL}/health` responde `{"ok": true}`.
- [ ] Registro de un usuario nuevo desde la URL de Vercel completa el flujo.
- [ ] Un test_run pasa de `pendiente` → `corriendo` → `exitoso` (mirar logs
      de Render).
- [ ] Los screenshots aparecen en el bucket `screenshots` y se renderizan
      en `/dashboard/runs/[id]`.
- [ ] Abrir `/dashboard/runs/[id]` mientras un run está corriendo: los pasos
      aparecen y avanzan **sin recargar** la página. Requiere que las tablas
      estén en la publication `supabase_realtime` (migración `0004`); el
      `refetch()` periódico del cliente cubre cualquier evento perdido.
- [ ] Crear un segundo usuario y confirmar que **no** ve los test_runs del
      primero (RLS).

---

## Notas de seguridad

- `.env.local` está en `.gitignore`. Verificá que **no** quedó commiteado
  con `git log --all --full-history -- .env.local`.
- Las claves listadas en este archivo son ejemplos; rotar inmediatamente
  cualquier clave que aparezca en un commit público.
- `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY` nunca pueden tener prefijo
  `NEXT_PUBLIC_`.
- `WORKER_SECRET` debe ser largo (≥ 32 caracteres aleatorios) y compartirse
  por igual entre Vercel y Render. Si se filtra, rotar inmediatamente en
  ambos lados.
