import IORedis, { type RedisOptions } from "ioredis";

let cachedConnection: IORedis | null = null;

function buildRedisOptions(): RedisOptions {
  const urlString = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;

  if (!urlString || !token) {
    throw new Error(
      "Faltan UPSTASH_REDIS_URL o UPSTASH_REDIS_TOKEN en el entorno",
    );
  }

  const parsed = new URL(urlString);
  const port = parsed.port ? Number(parsed.port) : 6379;

  return {
    host: parsed.hostname,
    port,
    password: token,
    tls: {},
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export function getRedisConnection(): IORedis {
  if (cachedConnection) return cachedConnection;
  cachedConnection = new IORedis(buildRedisOptions());
  return cachedConnection;
}
