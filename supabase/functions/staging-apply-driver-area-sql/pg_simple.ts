/** Minimal TLS + SCRAM-SHA-256 Postgres simple-query client for one-shot SQL. */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function i32be(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value);
  return bytes;
}

function cstring(value: string): Uint8Array {
  return encoder.encode(`${value}\0`);
}

function readI32(bytes: Uint8Array, offset = 0): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0);
}

async function readExact(conn: Deno.Conn, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  let offset = 0;
  while (offset < length) {
    const n = await conn.read(out.subarray(offset));
    if (n === null) throw new Error('pg_eof');
    offset += n;
  }
  return out;
}

async function readMessage(conn: Deno.Conn): Promise<{ tag: string; body: Uint8Array }> {
  const header = await readExact(conn, 5);
  const tag = String.fromCharCode(header[0]);
  const length = readI32(header, 1) - 4;
  const body = length > 0 ? await readExact(conn, length) : new Uint8Array();
  return { tag, body };
}

async function writeAll(conn: Deno.Conn, data: Uint8Array) {
  let offset = 0;
  while (offset < data.length) {
    offset += await conn.write(data.subarray(offset));
  }
}

function parseError(body: Uint8Array): string {
  const text = decoder.decode(body);
  const parts = text.split('\0').filter(Boolean);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part[0]] = part.slice(1);
  }
  return [map.C, map.M, map.D, map.H].filter(Boolean).join(' | ');
}

function b64(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return b64(bytes).replace(/[+/]/g, (ch) => (ch === '+' ? '-' : '_')).replace(/=+$/g, '');
}

async function hmac(key: ArrayBuffer | Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data));
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

async function pbkdf2(password: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

async function scramProof(password: string, clientFirstBare: string, serverFirst: string, nonce: string) {
  const attrs: Record<string, string> = {};
  for (const part of serverFirst.split(',')) {
    attrs[part[0]] = part.slice(2);
  }
  const salt = fromB64(attrs.s);
  const iterations = Number(attrs.i);
  const salted = await pbkdf2(encoder.encode(password), salt, iterations);
  const clientKey = await hmac(salted, encoder.encode('Client Key'));
  const storedKey = await sha256(clientKey);
  const clientFinalWithoutProof = `c=biws,r=${attrs.r}`;
  const authMessage = `${clientFirstBare},${serverFirst},${clientFinalWithoutProof}`;
  const clientSig = await hmac(storedKey, encoder.encode(authMessage));
  const proof = b64(xor(clientKey, clientSig));
  if (!attrs.r.startsWith(nonce)) throw new Error('scram_nonce_mismatch');
  return `${clientFinalWithoutProof},p=${proof}`;
}

function parseDbUrl(dbUrl: string) {
  const url = new URL(dbUrl.replace(/^postgres(ql)?:/, 'http:'));
  return {
    hostname: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent((url.pathname || '/postgres').replace(/^\//, '') || 'postgres'),
  };
}

async function connectTlsPostgres(hostname: string, port: number): Promise<Deno.Conn> {
  const tcp = await Deno.connect({ hostname, port });
  await writeAll(tcp, concat([i32be(8), i32be(80877103)]));
  const flag = await readExact(tcp, 1);
  if (flag[0] !== 83) {
    try { tcp.close(); } catch { /* ignore */ }
    throw new Error('pg_ssl_required');
  }
  return await Deno.startTls(tcp, { hostname });
}

async function startup(conn: Deno.Conn, user: string, database: string) {
  const payload = concat([
    i32be(196608),
    cstring('user'),
    cstring(user),
    cstring('database'),
    cstring(database),
    new Uint8Array([0]),
  ]);
  await writeAll(conn, concat([i32be(payload.length + 4), payload]));
}

async function saslExchange(conn: Deno.Conn, user: string, password: string, mechanisms: string) {
  if (!mechanisms.includes('SCRAM-SHA-256')) throw new Error(`unsupported_auth:${mechanisms}`);
  const nonce = randomNonce();
  const clientFirstBare = `n=${user},r=${nonce}`;
  const clientFirst = `n,,${clientFirstBare}`;
  const sasl = concat([cstring('SCRAM-SHA-256'), i32be(clientFirst.length), encoder.encode(clientFirst)]);
  await writeAll(conn, concat([encoder.encode('p'), i32be(sasl.length + 4), sasl]));

  const cont = await readMessage(conn);
  if (cont.tag !== 'R') throw new Error(`auth_continue_tag:${cont.tag}`);
  const type = readI32(cont.body);
  if (type !== 11) throw new Error(`auth_continue_type:${type}`);
  const serverFirst = decoder.decode(cont.body.subarray(4));
  const clientFinal = await scramProof(password, clientFirstBare, serverFirst, nonce);
  await writeAll(conn, concat([encoder.encode('p'), i32be(clientFinal.length + 4), encoder.encode(clientFinal)]));

  const final = await readMessage(conn);
  if (final.tag === 'E') throw new Error(parseError(final.body));
  if (final.tag !== 'R') throw new Error(`auth_final_tag:${final.tag}`);
  const finalType = readI32(final.body);
  if (finalType !== 12) throw new Error(`auth_final_type:${finalType}`);
}

async function authenticate(conn: Deno.Conn, user: string, password: string) {
  while (true) {
    const msg = await readMessage(conn);
    if (msg.tag === 'E') throw new Error(parseError(msg.body));
    if (msg.tag !== 'R') {
      if (msg.tag === 'Z') return;
      continue;
    }
    const type = readI32(msg.body);
    if (type === 0) return;
    if (type === 3) {
      const passwordMessage = cstring(password);
      await writeAll(conn, concat([encoder.encode('p'), i32be(passwordMessage.length + 4), passwordMessage]));
      continue;
    }
    if (type === 10) {
      const mechanisms = decoder.decode(msg.body.subarray(4));
      await saslExchange(conn, user, password, mechanisms);
      continue;
    }
    throw new Error(`unsupported_auth_type:${type}`);
  }
}

async function waitReady(conn: Deno.Conn) {
  while (true) {
    const msg = await readMessage(conn);
    if (msg.tag === 'E') throw new Error(parseError(msg.body));
    if (msg.tag === 'Z') return;
  }
}

export async function runSql(dbUrl: string, sqlText: string): Promise<void> {
  const cfg = parseDbUrl(dbUrl);
  const conn = await connectTlsPostgres(cfg.hostname, cfg.port);
  try {
    await startup(conn, cfg.user, cfg.database);
    await authenticate(conn, cfg.user, cfg.password);
    await waitReady(conn);
    const query = concat([encoder.encode(sqlText), new Uint8Array([0])]);
    await writeAll(conn, concat([encoder.encode('Q'), i32be(query.length + 4), query]));
    while (true) {
      const msg = await readMessage(conn);
      if (msg.tag === 'E') throw new Error(parseError(msg.body));
      if (msg.tag === 'Z') return;
    }
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}
