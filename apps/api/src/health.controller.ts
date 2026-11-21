import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth';
import { PrismaService } from './prisma.service';
import { StorageService } from './documents/storage.service';
import { ScannerService } from './documents/scanner.service';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private db: PrismaService,
    private storage: StorageService,
    private scanner: ScannerService
  ) {}

  @Public()
  @Get()
  async health() {
    await this.db.$queryRaw`SELECT 1`;
    return {
      ok: true,
      storage: this.storage.driver,
      scanner: this.scanner.mode,
      uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(),
    };
  }

  @Public()
  @Get('app/version')
  getAppVersion() {
    return {
      version: '1.1.0',
      versionCode: 2,
      buildDate: '2026-11-13',
      buildTime: 1794584400000,
      apkUrl: 'https://m2s-app-production.up.railway.app/m2s-field-survey.apk',
      apkSize: '7.4 MB',
      title: 'M2S Field Survey v1.1.0',
      releaseNotes: 'B2 single-select document verification, removed cluster target restrictions, and in-app update support.',
      mandatory: false,
    };
  }
}
