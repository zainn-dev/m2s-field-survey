import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthUser, isAdmin } from './auth';

/**
 * Record-level authorization.
 *  - SUPER_ADMIN / ADMIN: every household
 *  - SUPERVISOR: households in the clusters assigned to them
 *  - VOLUNTEER: households they surveyed (assignedVolunteerId)
 */
export function householdScope(user: AuthUser): Prisma.HouseholdWhereInput {
  if (isAdmin(user)) return {};
  if (user.role === 'SUPERVISOR') return { clusterId: { in: user.clusterIds } };
  return { assignedVolunteerId: user.sub };
}

export const surveyScope = (user: AuthUser): Prisma.SurveyWhereInput => ({ household: householdScope(user) });
export const documentScope = (user: AuthUser): Prisma.DocumentWhereInput => ({ household: householdScope(user) });

export async function assertHouseholdAccess(db: PrismaService, user: AuthUser, householdId: string) {
  const h = await db.household.findUnique({ where: { id: householdId } });
  if (!h) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Household not found' });
  if (isAdmin(user)) return h;
  if (user.role === 'VOLUNTEER' && h.assignedVolunteerId === user.sub) return h;
  if (user.role === 'SUPERVISOR' && user.clusterIds.includes(h.clusterId)) return h;
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'This household is outside your scope.' });
}
