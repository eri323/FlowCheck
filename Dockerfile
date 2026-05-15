# Dockerfile para el worker BullMQ + Playwright.
# Vercel construye el frontend; este Dockerfile es exclusivo del worker
# (Railway, Fly, Render, etc.).
FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm install --include=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY lib ./lib
COPY worker ./worker

# tsx vive en devDependencies y lo necesitamos en runtime.
# Lanzamos sin --env-file porque las variables las inyecta el proveedor (Railway).
CMD ["npx", "tsx", "worker/index.ts"]
