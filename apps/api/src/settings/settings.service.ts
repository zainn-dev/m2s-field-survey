import { Injectable } from '@nestjs/common';
import { DEFAULT_QUALITY_POLICY } from '@m2s/shared/validation';
import type { QualityPolicyConfig } from '@m2s/shared/types/survey';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/** Lets reads run on an open transaction instead of grabbing a second pool connection. */
type SettingReader = Pick<Prisma.TransactionClient, 'setting'>;

export interface DocCategory {
  id: string;
  label: string;
  labelHi: string;
  requiredForSubmission?: boolean;
  requiresLast4?: boolean;
  enabled: boolean;
}

export interface StudySettings {
  targetSample: number;
  allowVolunteerDelete: boolean;
  requireDocumentsForSubmission: boolean;
  qualityPolicy?: QualityPolicyConfig;
}

export const DEFAULT_STUDY: StudySettings = {
  targetSample: 100,
  allowVolunteerDelete: true,
  requireDocumentsForSubmission: false,
  qualityPolicy: DEFAULT_QUALITY_POLICY,
};

/** Key/value settings stored in the Setting table. */
@Injectable()
export class SettingsService {
  constructor(private db: PrismaService) {}

  async get<T>(key: string, fallback: T, client: SettingReader = this.db): Promise<T> {
    const s = await client.setting.findUnique({ where: { key } });
    return (s?.value as T) ?? fallback;
  }

  async set(key: string, value: unknown) {
    await this.db.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } });
  }

  docCategories(client?: SettingReader) {
    return this.get<DocCategory[]>('docCategories', [], client);
  }

  async study(client?: SettingReader): Promise<StudySettings> {
    const raw = await this.get<Partial<StudySettings>>('study', {}, client);
    const qp = await this.qualityPolicy(client);
    return { ...DEFAULT_STUDY, ...raw, qualityPolicy: qp };
  }

  async qualityPolicy(client?: SettingReader): Promise<QualityPolicyConfig> {
    const raw = await this.get<Partial<QualityPolicyConfig>>('qualityPolicy', {}, client);
    return { ...DEFAULT_QUALITY_POLICY, ...raw };
  }
}
