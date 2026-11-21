import { Injectable, Logger } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';

function resolveLocalStorageDir(): string {
  const configured = process.env.STORAGE_DIR || './.storage';
  if (isAbsolute(configured)) return configured;
  const apiRoot = existsSync(join(__dirname, '../../package.json'))
    ? resolve(__dirname, '../..')
    : resolve(__dirname, '../../..');
  return resolve(apiRoot, configured);
}

/**
 * Private object storage. Keys are random (never derived from names or IDs) and bytes are only ever
 * served through the API after a per-request permission check.
 *  - S3 / MinIO / R2 when S3_BUCKET is configured
 *  - otherwise a local directory (STORAGE_DIR, default ./.storage) outside any web root
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger('Storage');
  private readonly bucket = process.env.S3_BUCKET ?? '';
  private readonly s3 = this.bucket
    ? new S3Client({
        endpoint: process.env.S3_ENDPOINT || undefined,
        region: process.env.S3_REGION || 'auto',
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
      })
    : null;
  private readonly dir = resolveLocalStorageDir();

  constructor() {
    this.log.log(this.s3 ? `Using S3 bucket "${this.bucket}"` : `Using local private storage at ${this.dir}`);
  }

  get driver() {
    return this.s3 ? 's3' : 'local';
  }

  private newKey() {
    return randomBytes(24).toString('hex');
  }

  private localPath(key: string) {
    if (!/^[a-f0-9]{48}$/.test(key) && !/^[A-Za-z0-9-]{20,80}$/.test(key)) throw new Error('Invalid object key');
    return join(this.dir, key.slice(0, 2), key);
  }

  async put(bytes: Buffer, mime: string): Promise<string> {
    const key = this.newKey();
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: mime }));
    } else {
      const p = this.localPath(key);
      await mkdir(join(this.dir, key.slice(0, 2)), { recursive: true });
      await writeFile(p, bytes, { mode: 0o600 });
    }
    return key;
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3) {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return readFile(this.localPath(key));
  }

  async remove(key: string) {
    try {
      if (this.s3) await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      else await unlink(this.localPath(key));
    } catch (e) {
      this.log.warn(`Could not delete object ${key.slice(0, 6)}…: ${(e as Error).message}`);
    }
  }
}
