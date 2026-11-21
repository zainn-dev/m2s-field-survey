import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardPlus, MapPin } from 'lucide-react';
import { EmptyState } from '@m2s/shared/components/EmptyState';
import { useMobileStore } from '../store/mobileStore';
import { MobileLayout } from '../components/MobileLayout';

export const AssignedClusters: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, clusters, surveys, language } = useMobileStore();
  const hi = language === 'hi';

  const rows = useMemo(() => {
    const mine = clusters.filter((c) => currentUser.assignedClusterIds.includes(c.id));
    const list = mine.length > 0 ? mine : clusters;
    return list.map((cluster) => {
      const listHh = surveys.filter((s) => s.clusterId === cluster.id);
      const approved = listHh.filter((s) => s.status === 'APPROVED').length;
      const submitted = listHh.filter((s) => s.status === 'SUBMITTED').length;
      const drafts = listHh.filter((s) => s.status === 'DRAFT' || s.status === 'RETURNED').length;
      const progressCount = approved + submitted;
      const pct = cluster.targetHouseholds > 0 ? Math.min(100, Math.round((progressCount / cluster.targetHouseholds) * 100)) : 0;
      return { cluster, approved, submitted, drafts, progressCount, pct };
    });
  }, [clusters, currentUser.assignedClusterIds, surveys]);

  return (
    <MobileLayout title={hi ? 'क्लस्टर और लक्ष्य' : 'Assigned Clusters'} backTo="/dashboard">
      {rows.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-5 h-5" />}
          title="No clusters assigned"
          description="Ask your coordinator to assign active field clusters to your volunteer account."
        />
      ) : (
        <div className="space-y-3">
          {rows.map(({ cluster, approved, submitted, drafts, progressCount, pct }) => (
            <div key={cluster.id} className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[15.5px] font-bold text-[#181611]">{cluster.name}</h2>
                  <p className="text-[12px] text-[#5C5547]">
                    Code: {cluster.code} · Nagaon, Assam
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#FFF8D6] text-[#8C6200] text-[12px] font-bold tabular-nums">
                  {progressCount}/{cluster.targetHouseholds} ({pct}%)
                </span>
              </div>

              <div className="h-2.5 rounded-full bg-[#EFECE2] overflow-hidden">
                <div className="h-full bg-[#FDC513] rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>

              <div className="flex items-center justify-between text-[12px] text-[#5C5547]">
                <span>Approved: {approved} · Review: {submitted} · Draft/Returned: {drafts}</span>
                {cluster.active && (
                  <button
                    type="button"
                    onClick={() => navigate('/surveys/new', { state: { clusterId: cluster.id } })}
                    className="h-9 px-3 rounded-[10px] bg-[#FDC513] text-[#181611] text-[12px] font-bold inline-flex items-center gap-1"
                  >
                    <ClipboardPlus className="w-3.5 h-3.5" />
                    Start Survey
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </MobileLayout>
  );
};
