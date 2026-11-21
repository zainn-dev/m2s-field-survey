import { afterEach, describe, expect, it } from 'vitest';
import * as net from 'node:net';
import { ScannerService } from '../src/documents/scanner.service';

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

function startMockClamAv(replyForStream: (payload: Buffer) => string): Promise<{ port: number; received: Buffer[]; close: () => Promise<void> }> {
  const received: Buffer[] = [];
  const server = net.createServer((socket) => {
    const chunks: Buffer[] = [];
    socket.on('data', (d) => {
      chunks.push(d);
      const buf = Buffer.concat(chunks);
      // Wait for zINSTREAM\0 + framed chunks ending in 0x00000000 terminator
      if (!buf.subarray(0, 10).equals(Buffer.from('zINSTREAM\0', 'ascii'))) return;
      let offset = 10;
      const bodyParts: Buffer[] = [];
      while (offset + 4 <= buf.length) {
        const len = buf.readUInt32BE(offset);
        offset += 4;
        if (len === 0) {
          const full = Buffer.concat(bodyParts);
          received.push(full);
          socket.end(replyForStream(full));
          return;
        }
        if (offset + len > buf.length) return;
        bodyParts.push(buf.subarray(offset, offset + len));
        offset += len;
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        received,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe('ScannerService', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('allows clean PNG and PDF buffers in built-in mode', async () => {
    delete process.env.CLAMAV_HOST;
    const scanner = new ScannerService();
    expect(scanner.mode).toBe('builtin');

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');

    expect(await scanner.scanBuffer(png, 'image/png')).toEqual({ clean: true, status: 'CLEAN' });
    expect(await scanner.scanBuffer(pdf, 'application/pdf')).toEqual({ clean: true, status: 'CLEAN' });
  });

  it('rejects EICAR malware signature and active PDF JavaScript / Launch actions', async () => {
    delete process.env.CLAMAV_HOST;
    const scanner = new ScannerService();

    const eicarBuf = Buffer.concat([Buffer.from('\xff\xd8\xff\xe0'), Buffer.from(EICAR)]);
    const jsPdf = Buffer.from('%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>');
    const launchPdf = Buffer.from('%PDF-1.7\n1 0 obj << /Action << /S /Launch /F (cmd.exe) >> >>');

    const r1 = await scanner.scanBuffer(eicarBuf, 'image/jpeg');
    expect(r1.clean).toBe(false);
    expect(r1.status).toBe('INFECTED');

    const r2 = await scanner.scanBuffer(jsPdf, 'application/pdf');
    expect(r2.clean).toBe(false);
    expect(r2.status).toBe('INFECTED');

    const r3 = await scanner.scanBuffer(launchPdf, 'application/pdf');
    expect(r3.clean).toBe(false);
    expect(r3.status).toBe('INFECTED');
  });

  it('streams buffers via zINSTREAM to ClamAV and parses OK / FOUND responses', async () => {
    const cleanServer = await startMockClamAv(() => 'stream: OK\0');
    try {
      process.env.CLAMAV_HOST = '127.0.0.1';
      process.env.CLAMAV_PORT = String(cleanServer.port);
      const scanner = new ScannerService();
      expect(scanner.mode).toBe('clamav');

      const sample = Buffer.from('%PDF-1.4 clean payload');
      const res = await scanner.scanBuffer(sample, 'application/pdf');
      expect(res).toEqual({ clean: true, status: 'CLEAN' });
      expect(cleanServer.received[0]?.equals(sample)).toBe(true);
    } finally {
      await cleanServer.close();
    }

    const infectedServer = await startMockClamAv(() => 'stream: Win.Test.Trojan FOUND\0');
    try {
      process.env.CLAMAV_HOST = '127.0.0.1';
      process.env.CLAMAV_PORT = String(infectedServer.port);
      const scanner = new ScannerService();
      const res = await scanner.scanBuffer(Buffer.from('\x89PNG\r\n\x1a\n'), 'image/png');
      expect(res.clean).toBe(false);
      expect(res.status).toBe('INFECTED');
      expect(res.reason).toContain('Win.Test.Trojan');
    } finally {
      await infectedServer.close();
    }
  });

  it('respects CLAMAV_STRICT when daemon is unreachable', async () => {
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '1'; // closed port
    process.env.CLAMAV_TIMEOUT_MS = '500';
    process.env.CLAMAV_STRICT = 'true';

    const scanner = new ScannerService();
    const cleanPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const strictRes = await scanner.scanBuffer(cleanPng, 'image/png');
    expect(strictRes.clean).toBe(false);
    expect(strictRes.status).toBe('UNAVAILABLE');

    process.env.CLAMAV_STRICT = 'false';
    const relaxedRes = await scanner.scanBuffer(cleanPng, 'image/png');
    expect(relaxedRes.clean).toBe(true);
    expect(relaxedRes.status).toBe('CLEAN');
  });
});

