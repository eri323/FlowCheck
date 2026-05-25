import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Orígenes de Supabase para connect-src (REST + Realtime por WebSocket) e
// img-src (screenshots en Storage). Se derivan en build de la URL pública.
function supabaseOrigins(): { http: string; wss: string } {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return { http: "", wss: "" };
  try {
    const url = new URL(raw);
    return { http: url.origin, wss: `wss://${url.host}` };
  } catch {
    return { http: "", wss: "" };
  }
}

const { http: supabaseHttp, wss: supabaseWss } = supabaseOrigins();

// CSP sin nonce (enfoque documentado por Next.js): conserva el render estático y
// no rompe el script inline anti-flash de `layout.tsx` ni los scripts de
// framework de Next, a costa de 'unsafe-inline' en script/style. En dev se añade
// 'unsafe-eval' (React lo usa para los stack traces) y `ws:` (HMR). connect-src
// e img-src se acotan al proyecto de Supabase.
const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:${supabaseHttp ? ` ${supabaseHttp}` : ""}`,
  `font-src 'self'`,
  `connect-src 'self'${supabaseHttp ? ` ${supabaseHttp} ${supabaseWss}` : ""}${isDev ? " ws:" : ""}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
];
if (!isDev) cspDirectives.push(`upgrade-insecure-requests`);

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
