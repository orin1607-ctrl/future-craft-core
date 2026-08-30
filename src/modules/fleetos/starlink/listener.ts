import net from 'node:net';
import { extractStarlinkLines } from './parseMessage';
import { ingestStarlinkLine } from './ingest';
import type { GpsStore } from './store';
import type { IngestResult } from './types';
import { MAX_MESSAGE_BYTES } from './types';

export interface ListenerHandle {
  port: number;
  host: string;
  close: () => Promise<void>;
}

/**
 * Local/test TCP listener. Binds 127.0.0.1 only — no public bind.
 */
export function startStarlinkListener(
  store: GpsStore,
  opts?: { port?: number; onResult?: (r: IngestResult) => void },
): Promise<ListenerHandle> {
  const host = '127.0.0.1';
  const port = opts?.port ?? 0;

  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.setEncoding('utf8');
      let buf = '';
      socket.on('data', (chunk: string) => {
        buf += chunk;
        if (buf.length > MAX_MESSAGE_BYTES * 4) buf = buf.slice(-MAX_MESSAGE_BYTES);
        const { lines, rest } = extractStarlinkLines(buf);
        buf = rest;
        for (const line of lines) {
          const result = ingestStarlinkLine(store, line);
          opts?.onResult?.(result);
          if (result.ack) {
            socket.write(`${result.ack}\r\n`);
          }
        }
      });
    });
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('listener address unavailable'));
        return;
      }
      resolve({
        port: addr.port,
        host,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

export function sendTestLine(host: string, port: number, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port }, () => {
      sock.write(line.endsWith('\n') ? line : `${line}\r\n`);
    });
    let out = '';
    sock.setEncoding('utf8');
    sock.on('data', (c: string) => {
      out += c;
      sock.end();
    });
    sock.on('end', () => resolve(out.trim()));
    sock.on('error', reject);
    setTimeout(() => {
      sock.end();
      resolve(out.trim());
    }, 400);
  });
}
