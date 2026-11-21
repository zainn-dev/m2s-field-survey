import React, { useMemo, useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileArchive,
  FolderOpen,
  Loader2,
  XCircle,
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { StatCard } from '../../components/ui/StatCard';
import { SearchBar } from '../../components/ui/SearchBar';
import { FilterPanel } from '../../components/ui/FilterPanel';
import { ColumnDef, DataTable } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DocThumb } from '../../components/ui/DocumentCard';
import { DocumentPreview } from '../../components/ui/DocumentPreview';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAppStore } from '../../store/appStore';
import { HouseholdDocument } from '../../types/survey';

/** Ids travel in the query string; ~200 UUIDs stays well inside proxy URL limits (nginx default 8 KB). */
const MAX_ZIP_IDS = 200;

export const AdminDocuments: React.FC = () => {
  const {
    documents,
    clusters,
    docCategories,
    verifyDocument,
    rejectDocument,
    downloadDocument,
    downloadExport,
    notify,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [exportingZip, setExportingZip] = useState(false);
  const pageSize = 10;

  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<HouseholdDocument | null>(null);

  const totalDocs = documents.length;
  const pendingDocs = documents.filter((d) => d.verificationStatus === 'PENDING').length;
  const verifiedDocs = documents.filter((d) => d.verificationStatus === 'VERIFIED').length;
  const rejectedDocs = documents.filter((d) => d.verificationStatus === 'REJECTED').length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (clusterFilter && d.clusterName !== clusterFilter) return false;
      if (typeFilter && d.categoryId !== typeFilter) return false;
      if (statusFilter && d.verificationStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        d.surveyCode.toLowerCase().includes(q) ||
        d.headName.toLowerCase().includes(q) ||
        d.docType.toLowerCase().includes(q)
      );
    });
  }, [documents, search, clusterFilter, typeFilter, statusFilter]);

  // Keep the page in range when a verify/reject or background refresh shrinks the filtered list.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page]
  );

  const previewIndex = useMemo(
    () => filtered.findIndex((d) => d.id === previewDocId),
    [filtered, previewDocId]
  );
  const activePreviewDoc = previewIndex >= 0 ? filtered[previewIndex] : null;

  const selectedClusterId = useMemo(
    () => clusters.find((c) => c.name === clusterFilter)?.id,
    [clusters, clusterFilter]
  );

  const handleDownloadDoc = async (doc: HouseholdDocument) => {
    if (!doc.pages.length) return;
    try {
      await downloadDocument(doc, 0);
      notify(`Downloaded ${doc.docType} (${doc.surveyCode || 'household'})`);
    } catch {
      /* store toasted */
    }
  };

  const handleDownloadZip = async () => {
    if (filtered.length === 0 || exportingZip) return;
    setExportingZip(true);
    try {
      const hasNarrowFilter = Boolean(search.trim() || typeFilter);
      if (hasNarrowFilter && filtered.length > MAX_ZIP_IDS) {
        notify(`Too many documents for one ZIP (${filtered.length}). Narrow the search to ${MAX_ZIP_IDS} or fewer, or clear the search / type filter to export by cluster and status.`, 'error');
        return;
      }
      await downloadExport('documents.zip', {
        verification: statusFilter || undefined,
        clusterId: selectedClusterId || undefined,
        ids: hasNarrowFilter ? filtered.map((d) => d.id).join(',') : undefined,
      });
      notify(`Downloaded ZIP archive (${filtered.length} document${filtered.length === 1 ? '' : 's'})`);
    } catch {
      /* store toasted */
    } finally {
      setExportingZip(false);
    }
  };

  const columns: ColumnDef<HouseholdDocument>[] = [
    {
      key: 'preview',
      header: 'Preview',
      render: (d) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPreviewDocId(d.id);
          }}
          aria-label={`Preview ${d.docType}`}
          className="w-14 h-10 rounded-lg border border-[#E7E2D4] overflow-hidden bg-[#FAF8F2] block hover:ring-2 hover:ring-[#FDC513]/40"
        >
          <DocThumb doc={d} className="w-full h-full" iconClassName="w-5 h-5" />
        </button>
      ),
    },
    {
      key: 'docType',
      header: 'Document Type',
      render: (d) => (
        <div>
          <div className="font-bold text-[#181611]">{d.docType}</div>
          <div className="text-[11px] text-[#726C5D]">
            {d.pages.length} page(s)
            {d.aadhaarLast4 ? ` • XXXX-${d.aadhaarLast4}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'surveyCode',
      header: 'Survey ID',
      render: (d) => <span className="font-semibold text-[#8C6200]">{d.surveyCode}</span>,
    },
    {
      key: 'headName',
      header: 'Household Name',
      render: (d) => <span className="font-semibold text-[#181611]">{d.headName}</span>,
    },
    {
      key: 'clusterName',
      header: 'Cluster',
      render: (d) => <span className="text-xs text-[#726C5D]">{d.clusterName}</span>,
    },
    {
      key: 'uploadedBy',
      header: 'Uploaded By',
      render: (d) => <span className="text-xs">{d.uploadedByName}</span>,
    },
    {
      key: 'uploadDate',
      header: 'Upload Date',
      render: (d) => <span className="text-xs text-[#726C5D]">{d.uploadedAt.slice(0, 10)}</span>,
    },
    {
      key: 'verificationStatus',
      header: 'Verification Status',
      render: (d) => <StatusBadge status={d.verificationStatus} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (d) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="Preview"
            aria-label={`Preview ${d.docType}`}
            onClick={() => setPreviewDocId(d.id)}
            className="p-2 rounded-lg text-[#726C5D] hover:bg-[#FFF8D6] hover:text-[#6E4D00]"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Download"
            aria-label={`Download ${d.docType}`}
            onClick={() => handleDownloadDoc(d)}
            className="p-2 rounded-lg text-[#726C5D] hover:bg-[#FAF8F2] hover:text-[#181611]"
          >
            <Download className="w-4 h-4" />
          </button>
          {d.verificationStatus !== 'VERIFIED' && (
            <button
              type="button"
              title="Verify Document"
              aria-label={`Verify ${d.docType}`}
              onClick={() => verifyDocument(d.id).catch(() => undefined)}
              className="p-2 rounded-lg text-[#8C6200] hover:bg-[#FFF8D6]"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
          {d.verificationStatus !== 'REJECTED' && (
            <button
              type="button"
              title="Reject Document"
              aria-label={`Reject ${d.docType}`}
              onClick={() => setRejectTarget(d)}
              className="p-2 rounded-lg text-red-600 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const activeFilters = [clusterFilter, typeFilter, statusFilter].filter(Boolean).length;

  return (
    <AdminLayout
      title="Documents Repository"
      subtitle="Verify, inspect, and securely download household identity and land documents (private S3 access only)."
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
        <StatCard
          label="Total Uploaded Documents"
          value={totalDocs}
          tone="green"
          icon={<FolderOpen className="w-5 h-5" />}
          onClick={() => {
            setStatusFilter('');
            setPage(1);
          }}
        />
        <StatCard
          label="Pending Verification"
          value={pendingDocs}
          tone="yellow"
          icon={<Clock className="w-5 h-5" />}
          onClick={() => {
            setStatusFilter('PENDING');
            setPage(1);
          }}
        />
        <StatCard
          label="Verified Documents"
          value={verifiedDocs}
          tone="emerald"
          icon={<CheckCircle2 className="w-5 h-5" />}
          onClick={() => {
            setStatusFilter('VERIFIED');
            setPage(1);
          }}
        />
        <StatCard
          label="Rejected Documents"
          value={rejectedDocs}
          tone="purple"
          icon={<XCircle className="w-5 h-5" />}
          onClick={() => {
            setStatusFilter('REJECTED');
            setPage(1);
          }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by Survey ID or household name..."
          />
        </div>
        <button
          type="button"
          disabled={filtered.length === 0 || exportingZip}
          onClick={handleDownloadZip}
          className="min-h-[42px] px-4 rounded-xl bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-xs font-bold inline-flex items-center gap-2 shadow-sm transition disabled:opacity-50"
        >
          {exportingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
          Download Household Documents ZIP ({filtered.length})
        </button>
      </div>

      {/* Filters */}
      <FilterPanel
        activeCount={activeFilters}
        onReset={() => {
          setClusterFilter('');
          setTypeFilter('');
          setStatusFilter('');
          setPage(1);
        }}
      >
        <div className="w-full sm:w-auto">
          <label className="block text-[11px] font-semibold text-[#726C5D] mb-1">Cluster</label>
          <select
            value={clusterFilter}
            onChange={(e) => {
              setClusterFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-auto min-h-[40px] rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 text-xs font-medium"
          >
            <option value="">All Clusters</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-auto">
          <label className="block text-[11px] font-semibold text-[#726C5D] mb-1">
            Document Type
          </label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-auto min-h-[40px] rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 text-xs font-medium"
          >
            <option value="">All Document Types</option>
            {docCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-auto">
          <label className="block text-[11px] font-semibold text-[#726C5D] mb-1">
            Verification Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-auto min-h-[40px] rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 text-xs font-medium"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending Verification</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </FilterPanel>

      <DataTable
        data={paged}
        columns={columns}
        keyExtractor={(d) => d.id}
        page={page}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={setPage}
        onRowClick={(d) => setPreviewDocId(d.id)}
        renderMobileCard={(d) => (
          <div className="space-y-2.5" onClick={() => setPreviewDocId(d.id)}>
            <div className="flex items-start gap-3">
              <DocThumb doc={d} className="w-16 h-12 rounded-xl border border-[#E7E2D4] shrink-0" iconClassName="w-5 h-5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#181611] truncate">{d.docType}</div>
                <div className="text-xs text-[#726C5D]">
                  {d.surveyCode} • {d.headName} ({d.clusterName})
                </div>
                <div className="mt-1">
                  <StatusBadge status={d.verificationStatus} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => handleDownloadDoc(d)}
                className="min-h-[34px] px-2.5 rounded-lg border border-[#E7E2D4] bg-white text-xs font-semibold text-[#181611] inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              {d.verificationStatus !== 'VERIFIED' && (
                <button
                  type="button"
                  onClick={() => verifyDocument(d.id).catch(() => undefined)}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#FFF8D6] text-[#8C6200] text-xs font-semibold inline-flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                </button>
              )}
              {d.verificationStatus !== 'REJECTED' && (
                <button
                  type="button"
                  onClick={() => setRejectTarget(d)}
                  className="min-h-[34px] px-2.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              )}
            </div>
          </div>
        )}
      />

      <DocumentPreview
        doc={activePreviewDoc}
        onClose={() => setPreviewDocId(null)}
        hasPrev={previewIndex > 0}
        hasNext={previewIndex >= 0 && previewIndex < filtered.length - 1}
        onPrevDoc={() => {
          if (previewIndex > 0) setPreviewDocId(filtered[previewIndex - 1].id);
        }}
        onNextDoc={() => {
          if (previewIndex < filtered.length - 1) setPreviewDocId(filtered[previewIndex + 1].id);
        }}
        onVerify={(d) => verifyDocument(d.id).catch(() => undefined)}
        onReject={(d) => setRejectTarget(d)}
      />

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        title="Reject Document"
        description={`Provide a clear reason for rejecting ${rejectTarget?.docType} (${rejectTarget?.surveyCode}). The volunteer will be prompted to re-upload.`}
        variant="danger"
        requireReason
        reasonLabel="Rejection Reason"
        reasonPlaceholder="e.g., Text blurry, corner cut off, or wrong household document..."
        confirmLabel="Reject Document"
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          await rejectDocument(rejectTarget.id, reason); // stays open (store toasts) if it fails
          notify(`${rejectTarget.docType} (${rejectTarget.surveyCode}) rejected.`);
          setRejectTarget(null);
        }}
        onCancel={() => setRejectTarget(null)}
      />
    </AdminLayout>
  );
};

