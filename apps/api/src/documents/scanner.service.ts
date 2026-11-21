import { Injectable, Logger } from '@nestjs/common';
import * as net from 'node:net';

export interface ScanResult {
  clean: boolean;
  status: 'CLEAN' | 'INFECTED' | 'UNAVAILABLE';
  reason?: string;
}

const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const PDF_ACTIVE_ACTION_RE = /\/(?:JavaScript|Launch)\b/;
const INSTREAM_CHUNK_BYTES = 64 * 1024;

/**
 * Scans uploaded document buffers with built-in structural/signature checks
 * and optional ClamAV daemon TCP `INSTREAM` inspection (`CLAMAV_HOST`).
 */
@Injectable()
export class ScannerService {
  private readonly log = new Logger(ScannerService.name);

  get mode(): 'clamav' | 'builtin' {
    return process.env.CLAMAV_HOST?.trim() ? 'clamav' : 'builtin';
  }

  /**
   * Inspects raw file bytes before persistence.
   * Rejects known malware test signatures and active PDF actions, then delegates to ClamAV when configured.
   */
  async scanBuffer(buf: Buffer, mime: string): Promise<ScanResult> {
    const builtinIssue = this.runBuiltinChecks(buf, mime);
    if (builtinIssue) {
      return { clean: false, status: 'INFECTED', reason: builtinIssue };
    }

    const host = process.env.CLAMAV_HOST?.trim();
    if (!host) {
      return { clean: true, status: 'CLEAN' };
    }

    const port = Number(process.env.CLAMAV_PORT ?? 3310);
    const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS ?? 10_000);
    const strict = process.env.CLAMAV_STRICT !== 'false';

    try {
      const reply = await this.scanWithClamAv(host, port, timeoutMs, buf);
      if (/:\s*OK$/i.test(reply) || reply === 'OK') {
        return { clean: true, status: 'CLEAN' };
      }
      const foundMatch = reply.match(/^(?:stream:\s*)?(.+?)\s+FOUND$/i);
      if (foundMatch) {
        return { clean: false, status: 'INFECTED', reason: `ClamAV signature: ${foundMatch[1]}` };
      }
      return this.handleClamError(strict, `Unexpected ClamAV response: ${reply || '(empty)'}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.handleClamError(strict, `ClamAV unreachable (${host}:${port}): ${msg}`);
    }
  }

  private runBuiltinChecks(buf: Buffer, mime: string): string | null {
    const text = buf.toString('latin1');
    if (text.includes(EICAR_SIGNATURE)) {
      return 'EICAR malware test signature detected';
    }
    if (mime === 'application/pdf' || text.startsWith('%PDF-')) {
      const match = text.match(PDF_ACTIVE_ACTION_RE);
      if (match) {
        return `Unsupported active PDF action (${match[0]})`;
      }
    }
    return null;
  }

  private handleClamError(strict: boolean, reason: string): ScanResult {
    this.log.warn(reason);
    if (!strict) {
      return { clean: true, status: 'CLEAN', reason: 'clamav_bypassed_non_strict' };
    }
    return { clean: false, status: 'UNAVAILABLE', reason };
  }

  private scanWithClamAv(host: string, port: number, timeoutMs: number, buf: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (err?: Error, reply?: string) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        if (err) reject(err);
        else resolve((reply ?? '').replace(/\0/g, '').trim());
      };

      socket.setTimeout(timeoutMs);
      socket.on('timeout', () => finish(new Error(`ClamAV timed out after ${timeoutMs}ms`)));
      socket.on('error', (err) => finish(err));
      socket.on('data', (chunk) => {
        chunks.push(chunk);
        if (chunk.includes(0) || chunk.includes(10)) {
          finish(undefined, Buffer.concat(chunks).toString('utf8'));
        }
      });
      socket.on('end', () => finish(undefined, Buffer.concat(chunks).toString('utf8')));

      socket.on('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0', 'ascii'));
        for (let offset = 0; offset < buf.length; offset += INSTREAM_CHUNK_BYTES) {
          const slice = buf.subarray(offset, offset + INSTREAM_CHUNK_BYTES);
          const lenHdr = Buffer.allocUnsafe(4);
          lenHdr.writeUInt32BE(slice.length, 0);
          socket.write(lenHdr);
          socket.write(slice);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

