@AGENTS.md
# Plataforma de Testing Automatizado con IA — CLAUDE.md

## Qué es este proyecto

Plataforma web donde el usuario pega una URL y describe un flujo en lenguaje natural.
El sistema llama a la API de Claude para generar casos de prueba en Playwright, los ejecuta
en un navegador headless y devuelve un reporte en vivo con screenshots por cada paso.

Equivalente real: Testim.io, Mabl, Reflect.run — pero construido desde cero.

---

## Arquitectura

```
frontend/          → Next.js 14 App Router + Tailwind CSS + TypeScript
backend/           → API Routes de Next.js (mismo repo, /app/api/)
worker/            → Proceso Node.js independiente — consumidor de BullMQ
```

Monorepo. El frontend y las rutas de API viven en Next.js.
El worker de Playwright es un proceso separado porque necesita correr jobs largos
(30–60s) sin bloquear las requests HTTP.

---

## Stack

| Capa           | Tecnología              |
|----------------|-------------------------|
| Frontend       | Next.js 14, Tailwind    |
| Auth + DB      | Supabase                |
| Tiempo real    | Supabase Realtime       |
| Archivos       | Supabase Storage        |
| IA             | @anthropic-ai/sdk       |
| Tests browser  | Playwright (Chromium)   |
| Cola de jobs   | BullMQ + Upstash Redis  |
| Deploy front   | Vercel                  |
| Deploy worker  | Railway                 |
| Lenguaje       | TypeScript en todo      |

---

## Comandos principales

```bash
npm run dev          # Inicia servidor de desarrollo Next.js (puerto 3000)
npm run worker       # Inicia proceso worker BullMQ
npm run build        # Build de producción
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
```

---

## Tablas en Supabase

- `profiles` — vinculado a auth.users, guarda plan y rol del usuario
- `projects` — cada usuario tiene proyectos (nombre, url objetivo)
- `test_runs` — un registro por ejecución (status, created_at, user_id)
- `test_cases` — generados por la IA, pertenecen a un test_run
- `test_steps` — cada paso de un test_case (acción, selector, status, screenshot_url)

Row Level Security activado en todas las tablas. Cada usuario solo ve sus propios datos.

---

## Variables de entorno

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # solo backend/worker, nunca en el cliente

# Anthropic
ANTHROPIC_API_KEY=               # solo worker, nunca en el cliente

# Redis (Upstash)
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
```

---

## Convenciones de código

- TypeScript en modo strict. Prohibido usar `any`.
- Todas las rutas de API validan el input con Zod antes de tocar la DB.
- Sin exports por defecto — solo exports nombrados.
- Las queries de Supabase siempre manejan explícitamente el patrón `{ data, error }`.
- Cada nuevo endpoint necesita su test correspondiente en `/tests/api/`.
- Los screenshots se suben a Supabase Storage (bucket `screenshots`) antes de guardar la URL en DB.

---

## Roadmap del proyecto

### Fase 1 — Base del proyecto
Configuración inicial del entorno, autenticación y estructura de la base de datos.
El objetivo de esta fase es tener el proyecto corriendo localmente con login funcional
y la estructura de tablas lista en Supabase.

- [ ] Crear proyecto Next.js 14 con TypeScript y Tailwind
- [ ] Configurar Supabase: tablas, relaciones y políticas RLS
- [ ] Implementar autenticación con Supabase Auth (registro, login, logout)
- [ ] Crear layout base del dashboard (protegido por auth)
- [ ] Configurar variables de entorno para todos los servicios
- [ ] Configurar ESLint, Prettier y TypeScript en modo strict

### Fase 2 — Integración con IA
Conectar el formulario del usuario con la API de Anthropic.
El objetivo es que el sistema reciba un prompt en lenguaje natural y devuelva
un JSON válido con los casos de prueba estructurados.

- [ ] Crear formulario: campo URL + campo prompt en lenguaje natural
- [ ] Instalar y configurar @anthropic-ai/sdk en el worker
- [ ] Diseñar el prompt de sistema que instruye a Claude a devolver JSON estructurado
- [ ] Crear endpoint POST /api/test-runs (validado con Zod, guarda en DB con status "pendiente")
- [ ] Implementar llamada a Anthropic desde el worker y parsear la respuesta
- [ ] Validar que el JSON devuelto cumple el contrato de tipos esperado
- [ ] Manejar errores: respuesta malformada, timeout, límite de tokens

### Fase 3 — Motor de ejecución con Playwright
Ejecutar los casos de prueba generados por la IA en un browser real.
El objetivo es que cada paso del JSON se ejecute, se capture su resultado
y se suba el screenshot a Supabase Storage.

- [ ] Instalar Playwright y configurar Chromium headless en el worker
- [ ] Implementar el runner: iterar los pasos del JSON y ejecutar cada acción
- [ ] Soportar acciones: goto, click, fill, expect (visible, text, url)
- [ ] Capturar screenshot después de cada paso y subir a Supabase Storage
- [ ] Registrar resultado por paso (passed/failed) y mensaje de error si aplica
- [ ] Actualizar estado del test_run en Supabase al terminar (completed/failed)
- [ ] Implementar timeout por job (máximo 120s) para evitar procesos colgados

### Fase 4 — Cola de jobs asíncrona
Desacoplar la ejecución de Playwright del ciclo request-response de HTTP.
El objetivo es que el usuario no espere bloqueado y el worker procese los jobs
de forma independiente y resiliente.

- [ ] Instalar BullMQ y conectar con Upstash Redis
- [ ] Modificar POST /api/test-runs para encolar el job en lugar de ejecutar directo
- [ ] Crear el proceso worker que consume la cola y ejecuta Playwright
- [ ] Implementar reintentos automáticos (máximo 2 reintentos por job fallido)
- [ ] Configurar concurrencia: máximo 3 jobs simultáneos por instancia del worker
- [ ] Registrar logs de cada job (inicio, fin, error) en la tabla test_runs

### Fase 5 — Reporte en tiempo real
Mostrar el progreso y resultado de la ejecución en el dashboard sin recargar la página.
El objetivo es que el usuario vea cada paso completarse en vivo mientras Playwright trabaja.

- [ ] Configurar suscripción a Supabase Realtime en el frontend
- [ ] Crear vista de reporte: lista de test_cases con sus test_steps
- [ ] Mostrar estado en vivo por paso (pendiente / corriendo / passed / failed)
- [ ] Mostrar screenshot de cada paso al hacer click
- [ ] Mostrar duración total del test_run al completarse
- [ ] Crear vista de historial: todos los test_runs del usuario ordenados por fecha

### Fase 6 — Despliegue y producción
Llevar el proyecto a producción con los dos servicios desplegados y funcionando.
El objetivo es tener una URL pública funcional lista para el portafolio.

- [ ] Desplegar frontend en Vercel con variables de entorno de producción
- [ ] Desplegar worker en Railway con variables de entorno de producción
- [ ] Configurar Upstash Redis en producción
- [ ] Verificar que RLS de Supabase funciona correctamente en producción
- [ ] Escribir README.md del proyecto con GIF demo del flujo completo
- [ ] Agregar el proyecto al portafolio con descripción técnica del stack

---

## Lo que NO se debe hacer — Reglas de seguridad

### Exposición de claves y credenciales

- **Nunca** poner `ANTHROPIC_API_KEY` en ningún archivo del lado del cliente.
  Si esta clave queda expuesta, cualquier persona puede hacer llamadas a la API
  de Anthropic cobrándole a la cuenta del dueño del proyecto sin límite.
- **Nunca** poner `SUPABASE_SERVICE_ROLE_KEY` en el frontend ni en rutas de API
  accesibles públicamente. Esta clave bypasea todas las políticas RLS de Supabase,
  lo que significa acceso total a todos los datos de todos los usuarios.
- **Nunca** commitear archivos `.env` al repositorio. Agregar `.env*` al `.gitignore`
  desde el primer commit. Si una clave se sube a GitHub aunque sea por un segundo,
  debe considerarse comprometida y regenerarse inmediatamente.
- Las variables que empiezan con `NEXT_PUBLIC_` en Next.js son visibles en el browser.
  Solo pueden llevar esa nomenclatura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Ninguna otra variable sensible puede tener ese prefijo.

### Validación de inputs del usuario

- **Nunca** usar directamente en Playwright un selector que venga del input del usuario
  sin validarlo primero con Zod. Un usuario malicioso podría inyectar un selector
  que ejecute acciones no deseadas en el browser del servidor.
- **Nunca** usar directamente como URL el valor que envía el usuario sin validar
  que sea una URL bien formada y que el esquema sea `http` o `https`.
  Evitar esquemas como `file://`, `javascript:` o `data:` que podrían
  acceder al sistema de archivos del servidor o ejecutar código arbitrario.
- Toda entrada del usuario que llegue a una ruta de API debe pasar por un schema
  de Zod antes de cualquier otra operación. Si la validación falla, responder
  con status 400 y no continuar.

### Ejecución de Playwright en el servidor

- **Nunca** ejecutar Playwright directamente desde una ruta de API de Next.js.
  Siempre pasar por la cola de BullMQ. Además del problema de timeout,
  un atacante que sature el endpoint podría lanzar cientos de browsers simultáneos
  y derribar el servidor.
- Implementar un límite de rate por usuario en el endpoint POST /api/test-runs.
  Un usuario no debe poder encolar más de 5 jobs por minuto.
- El worker de Playwright debe correr con permisos mínimos del sistema operativo.
  No debe tener acceso de escritura fuera del directorio temporal de screenshots.

### Rutas de API y autenticación

- **Nunca** confiar en el `user_id` que viene en el body de una request.
  Siempre leer el usuario autenticado desde la sesión de Supabase en el servidor.
  Un atacante podría enviar cualquier `user_id` en el body para acceder a datos ajenos.
- Todas las rutas de API que lean o escriban datos deben verificar que el usuario
  tiene sesión activa antes de ejecutar cualquier query.
- Las políticas RLS en Supabase son la última línea de defensa, no la única.
  La lógica de autorización debe existir también en el backend.