import React from 'react';
import { DocUploadStatus, DocVerificationStatus, Role, SurveyStatus } from '../types/survey';

export type BadgeVariant =
  | SurveyStatus
  | DocUploadStatus
  | DocVerificationStatus
  | Role
  | 'ACTIVE'
  | 'INACTIVE';

/* Palette shared with the dashboard's status pills (RecentSurveys). */
const TONE = {
  gold: 'bg-[#FFF3B0] text-[#5C4100] border border-[#E8C533]/50',
  amber: 'bg-[#FCE8CC] text-[#8A4800]',
  grey: 'bg-[#F0EDE2] text-[#4A4538]',
  blue: 'bg-[#E6EEF9] text-[#2D5E9E]',
  orange: 'bg-[#FDE8D8] text-[#A1460B]',
  red: 'bg-[#FDE2E1] text-[#B42318]',
  purple: 'bg-[#EEEBFB] text-[#5A45AE]',
  slate: 'bg-[#E7ECF2] text-[#2C3E50]',
} as const;

const DOT: Record<keyof typeof TONE, string> = {
  gold: 'bg-[#D4A100]',
  amber: 'bg-[#D97706]',
  grey: 'bg-[#8C8677]',
  blue: 'bg-[#2D69B3]',
  orange: 'bg-[#D9661A]',
  red: 'bg-[#D64545]',
  purple: 'bg-[#6A55C2]',
  slate: 'bg-[#475569]',
};

const CONFIG: Record<BadgeVariant, { label: string; tone: keyof typeof TONE }> = {
  // Survey statuses
  DRAFT: { label: 'Draft', tone: 'grey' },
  PENDING_SYNC: { label: 'Pending Sync', tone: 'blue' },
  SUBMITTED: { label: 'Pending Review', tone: 'blue' },
  APPROVED: { label: 'Approved', tone: 'gold' },
  RETURNED: { label: 'Returned', tone: 'orange' },
  REJECTED: { label: 'Rejected', tone: 'red' },

  // Document upload statuses
  LOCAL_ONLY: { label: 'On Device', tone: 'grey' },
  UPLOADING: { label: 'Uploading…', tone: 'blue' },
  UPLOADED: { label: 'Uploaded', tone: 'gold' },
  UPLOAD_FAILED: { label: 'Upload Failed', tone: 'red' },

  // Verification statuses
  PENDING: { label: 'Pending Verification', tone: 'blue' },
  VERIFIED: { label: 'Verified', tone: 'gold' },

  // Roles & account states
  SUPER_ADMIN: { label: 'Super Admin', tone: 'purple' },
  ADMIN: { label: 'Admin', tone: 'gold' },
  SUPERVISOR: { label: 'Supervisor', tone: 'blue' },
  VOLUNTEER: { label: 'Volunteer', tone: 'slate' },
  ACTIVE: { label: 'Active', tone: 'gold' },
  INACTIVE: { label: 'Disabled', tone: 'red' },
};

/** Human label for any badge variant (useful for tooltips, filters and exports). */
export const statusLabel = (status: BadgeVariant): string => CONFIG[status]?.label ?? String(status);

export const StatusBadge: React.FC<{
  status: BadgeVariant;
  labelOverride?: string;
  size?: 'sm' | 'md';
  /** Prefix the label with a small coloured dot. */
  dot?: boolean;
  className?: string;
}> = ({ status, labelOverride, size = 'sm', dot = false, className = '' }) => {
  const cfg = CONFIG[status] ?? { label: String(status), tone: 'grey' as const };
  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap leading-none ${
        size === 'sm' ? 'h-[22px] px-2 text-[11.5px]' : 'h-[26px] px-2.5 text-[12.5px]'
      } ${TONE[cfg.tone]} ${className}`}
    >
      {dot && <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${DOT[cfg.tone]}`} />}
      {labelOverride ?? cfg.label}
    </span>
  );
};
