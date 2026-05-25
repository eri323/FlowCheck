// --- IPv4 ---

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    acc = (acc << 8) | n;
  }
  return acc >>> 0;
}

// Rangos IPv4 a bloquear, pre-parseados a [baseInt, bits] al cargar el módulo
// (evita re-parsear el string base en cada chequeo).
const BLOCKED_V4: Array<[number, number]> = (
  [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24], // IETF Protocol Assignments (RFC 6890)
    ["192.168.0.0", 16],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as Array<[string, number]>
).map(([base, bits]) => [ipv4ToInt(base)!, bits] as [number, number]);

function inV4Range(ip: number, baseInt: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) >>> 0 === (baseInt & mask) >>> 0;
}

function isBlockedIpv4(ip: number): boolean {
  return BLOCKED_V4.some(([baseInt, bits]) => inV4Range(ip, baseInt, bits));
}

// --- IPv6 ---

function ipv6Groups(ip: string): number[] | null {
  let s = ip.split("%")[0]!; // descarta zone id
  if (s.includes(".")) {
    const idx = s.lastIndexOf(":");
    if (idx === -1) return null;
    const v4 = ipv4ToInt(s.slice(idx + 1));
    if (v4 === null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    s = s.slice(0, idx + 1) + hi + ":" + lo;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function isBlockedIpv6(g: number[]): boolean {
  if (g.every((x) => x === 0)) return true; // ::
  if (
    g[0]! === 0 &&
    g[1]! === 0 &&
    g[2]! === 0 &&
    g[3]! === 0 &&
    g[4]! === 0 &&
    g[5]! === 0 &&
    g[6]! === 0 &&
    g[7]! === 1
  ) {
    return true; // ::1
  }
  if (
    g[0]! === 0 &&
    g[1]! === 0 &&
    g[2]! === 0 &&
    g[3]! === 0 &&
    g[4]! === 0 &&
    g[5]! === 0xffff
  ) {
    return isBlockedIpv4(((g[6]! << 16) | g[7]!) >>> 0); // ::ffff:a.b.c.d
  }
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0]! & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

// --- Clasificadores públicos ---

// Detecta el tipo de IP literal SIN node:net (este módulo se importa en el
// bundle del cliente, donde node:net no existe).
function ipKind(s: string): 0 | 4 | 6 {
  if (ipv4ToInt(s) !== null) return 4;
  if (s.includes(":") && ipv6Groups(s) !== null) return 6;
  return 0;
}

export function isBlockedIp(ip: string): boolean {
  const kind = ipKind(ip);
  if (kind === 4) return isBlockedIpv4(ipv4ToInt(ip)!);
  if (kind === 6) {
    const g = ipv6Groups(ip);
    return g ? isBlockedIpv6(g) : true;
  }
  return false; // no es IP literal: la enforcement real (con DNS) vive en el worker
}

// Encodings de IPv4 de un solo número: decimal (2130706433) y hex (0x7f000001).
// NOTA: los encodings octales multi-octeto (p. ej. 0177.0.0.1) quedan FUERA de
// alcance aquí; los cubre la resolución DNS del worker.
function parseLooseIpv4(host: string): number | null {
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  if (/^0x[0-9a-fA-F]+$/.test(host)) {
    const n = parseInt(host, 16);
    return n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  return null;
}

export function isBlockedLiteralHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (ipKind(host) !== 0) return isBlockedIp(host);
  const loose = parseLooseIpv4(host);
  if (loose !== null) return isBlockedIpv4(loose);
  return false;
}
