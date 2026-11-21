import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
  meta?: Prisma.InputJsonValue;
  ip?: string;
}

/** Append-only audit trail. Never stores document bytes, full Aadhaar or passwords. */
@Injectable()
export class AuditService {
  constructor(private db: PrismaService) {}

  log(e: AuditInput, tx: Prisma.TransactionClient = this.db) {
    return tx.auditLog.create({
      data: {
        actorId: e.actorId ?? null,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        summary: e.summary,
        meta: e.meta,
        ip: e.ip,
      },
    });
  }
}
