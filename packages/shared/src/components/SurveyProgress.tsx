import React from 'react';

interface SurveyProgressProps {
  /** 1-based index of the current wizard section. */
  sectionNumber: number;
  sectionCount: number;
  sectionName: string;
  answeredCount: number;
  totalQuestions: number;
  /** Save / sync indicator rendered on the right of the answered line. */
  status?: React.ReactNode;
}

/** "Section X of N · name" plus overall answered-question progress. */
export const SurveyProgress: React.FC<SurveyProgressProps> = ({
  sectionNumber,
  sectionCount,
  sectionName,
  answeredCount,
  totalQuestions,
  status,
}) => {
  const pct = totalQuestions > 0 ? Math.min(100, Math.round((answeredCount / totalQuestions) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[13px] text-[#524D40] truncate">
          <span className="font-semibold text-[#181611]">
            Section {sectionNumber} of {sectionCount}
          </span>
          <span aria-hidden> · </span>
          <span>{sectionName}</span>
        </p>
        <span className="shrink-0 text-[12.5px] font-semibold text-[#8C6200] tabular-nums">
          {answeredCount}/{totalQuestions} answered
        </span>
      </div>
      <div
        className="w-full h-1.5 bg-[#E7E2D4] rounded-full overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalQuestions}
        aria-valuenow={answeredCount}
        aria-label="Questions answered"
      >
        <div className="h-full bg-[#FDC513] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      {status && <div className="flex justify-end text-[12px]">{status}</div>}
    </div>
  );
};
