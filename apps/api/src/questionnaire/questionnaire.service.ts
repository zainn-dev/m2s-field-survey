import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { QuestionDef } from '../common/validation';

export interface LoadedQuestionnaire {
  id: string;
  version: number;
  questions: Map<string, QuestionDef>;
}

/** Caches the latest questionnaire version (definition is immutable once seeded). */
@Injectable()
export class QuestionnaireService {
  private cached: LoadedQuestionnaire | null = null;
  constructor(private db: PrismaService) {}

  async latest(): Promise<LoadedQuestionnaire> {
    if (this.cached) return this.cached;
    const qv = await this.db.questionnaireVersion.findFirst({ orderBy: { version: 'desc' } });
    if (!qv) throw new BadRequestException({ code: 'NO_QUESTIONNAIRE', message: 'No questionnaire loaded. Run npm run seed.' });
    const defs = ((qv.definition as any).questions ?? []) as QuestionDef[];
    this.cached = { id: qv.id, version: qv.version, questions: new Map(defs.map((q) => [q.id, q])) };
    return this.cached;
  }
}
