import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, FileText, Globe, KeyRound, Loader2, Plus, RotateCcw, Save, Settings2, Trash2, UserRound } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Panel } from '../../components/dashboard/Panel';
import { useAppStore } from '../../store/appStore';
import { STUDY_META } from '../../data/questionnaire';
import type { DocumentCategoryConfig, Language, QualityPolicyConfig, StudySettings } from '../../types/survey';
import {
  Avatar,
  btnPrimary,
  btnSecondary,
  btnSmall,
  Field,
  iconBtn,
  inputCls,
  isAdminRole,
  PasswordInput,
  passwordProblem,
  ReadOnlyNote,
  RolePill,
  thCls,
  timeAgo,
  Toggle,
} from './AdminUsers';

type Tab = 'account' | 'study' | 'documents' | 'preferences';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'study', label: 'Study', icon: Settings2 },
  { id: 'documents', label: 'Document categories', icon: FileText },
  { id: 'preferences', label: 'Preferences', icon: Globe },
];

export const AdminSettings: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.some((t) => t.id === raw) ? raw : 'account';

  return (
    <AdminLayout title="Settings" subtitle="Your account, study configuration and document rules.">
      <div className="bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_1px_2px_rgba(24,22,17,0.04)] px-2 sm:px-4">
        <div role="tablist" className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const on = t.id === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => setParams(t.id === 'account' ? {} : { tab: t.id }, { replace: true })}
                className={`relative inline-flex items-center gap-2 px-3 sm:px-4 pt-3.5 pb-3 text-[13.5px] whitespace-nowrap transition-colors ${
                  on ? 'text-[#8C6200] font-semibold' : 'text-[#363127] hover:text-[#6E4D00]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {on && <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-full bg-[#FDC513]" />}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'account' && <AccountTab />}
      {tab === 'study' && <StudyTab />}
      {tab === 'documents' && <DocCategoriesTab />}
      {tab === 'preferences' && <PreferencesTab />}
    </AdminLayout>
  );
};

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

const AccountTab: React.FC = () => {
  const { currentUser, clusters, changePassword, notify } = useAppStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  const clusterNames = isAdminRole(currentUser.role)
    ? 'All clusters'
    : currentUser.assignedClusterIds.map((id) => clusters.find((c) => c.id === id)?.name ?? id).join(', ') || 'None assigned';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: typeof errors = {};
    if (!current) errs.current = 'Enter your current password.';
    const p = passwordProblem(next);
    if (p) errs.next = p;
    else if (next === current) errs.next = 'Choose a password different from the current one.';
    if (!errs.next && next !== confirm) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await changePassword(current, next);
      notify('Password changed. Other devices have been signed out.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch {
      /* toasted by the store */
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, React.ReactNode][] = [
    ['Email', currentUser.email],
    ['Mobile', currentUser.mobile || '—'],
    ['Role', <RolePill key="r" role={currentUser.role} />],
    ['Clusters', clusterNames],
    ['Last active', timeAgo(currentUser.lastActive)],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <Panel title="Profile" bodyClassName="px-4 pb-4">
        <div className="flex items-center gap-3 pb-4 border-b border-[#EFECE2]">
          <Avatar name={currentUser.name} size={52} />
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-[#181611] truncate">{currentUser.name}</div>
            <div className="text-[13px] text-[#5C5547] truncate">{currentUser.email}</div>
          </div>
        </div>
        <dl className="divide-y divide-[#EFECE2]">
          {rows.map(([k, v]) => (
            <div key={k} className="py-2.5 grid grid-cols-[110px_1fr] gap-3 text-[13.5px]">
              <dt className="text-[#5C5547]">{k}</dt>
              <dd className="text-[#181611] min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12.5px] text-[#726C5D]">To change your name, email or mobile, ask an admin to edit your account in Users &amp; Roles.</p>
      </Panel>

      <Panel title="Change password" bodyClassName="px-4 pb-4">
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Current password" htmlFor="cp-current" required error={errors.current}>
            <PasswordInput id="cp-current" value={current} onChange={(v) => { setCurrent(v); setErrors((e) => ({ ...e, current: undefined })); }} autoComplete="current-password" disabled={busy} invalid={!!errors.current} />
          </Field>
          <Field label="New password" htmlFor="cp-next" required error={errors.next} hint="At least 10 characters with letters and digits.">
            <PasswordInput id="cp-next" value={next} onChange={(v) => { setNext(v); setErrors((e) => ({ ...e, next: undefined })); }} disabled={busy} invalid={!!errors.next} />
          </Field>
          <Field label="Confirm new password" htmlFor="cp-confirm" required error={errors.confirm}>
            <PasswordInput id="cp-confirm" value={confirm} onChange={(v) => { setConfirm(v); setErrors((e) => ({ ...e, confirm: undefined })); }} disabled={busy} invalid={!!errors.confirm} />
          </Field>
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Update password
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Study                                                               */
/* ------------------------------------------------------------------ */

const StudyTab: React.FC = () => {
  const { study, clusters, currentUser, updateStudySettings, qualityPolicy, updateQualityPolicy, notify } = useAppStore();
  const admin = isAdminRole(currentUser.role);
  const [draft, setDraft] = useState<StudySettings>(study);
  const [target, setTarget] = useState(String(study.targetSample));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [policyDraft, setPolicyDraft] = useState<QualityPolicyConfig>(qualityPolicy);
  const [minDurationInput, setMinDurationInput] = useState(String(qualityPolicy.minDurationSec));
  const [policyError, setPolicyError] = useState('');
  const [policyBusy, setPolicyBusy] = useState(false);

  // Background refreshes hand us new objects every ~45 s; only reset the drafts when the saved values really change,
  // otherwise an admin's unsaved edits would be wiped mid-typing.
  const studyKey = `${study.targetSample}|${study.allowVolunteerDelete}|${study.requireDocumentsForSubmission}`;
  useEffect(() => {
    setDraft(study);
    setTarget(String(study.targetSample));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyKey]);

  const policyKey = JSON.stringify(qualityPolicy);
  useEffect(() => {
    setPolicyDraft(qualityPolicy);
    setMinDurationInput(String(qualityPolicy.minDurationSec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyKey]);

  const policyDirty =
    policyDraft.blockOnErrors !== qualityPolicy.blockOnErrors ||
    policyDraft.requireWarningAcknowledgement !== qualityPolicy.requireWarningAcknowledgement ||
    policyDraft.allowSupervisorOverride !== qualityPolicy.allowSupervisorOverride ||
    policyDraft.escalateVerifiedExceptionsToSupervisor !== qualityPolicy.escalateVerifiedExceptionsToSupervisor ||
    minDurationInput !== String(qualityPolicy.minDurationSec);

  const savePolicy = async () => {
    const secs = Number(minDurationInput);
    if (!Number.isInteger(secs) || secs < 30 || secs > 3600) {
      return setPolicyError('Enter a whole number of seconds between 30 and 3600.');
    }
    setPolicyBusy(true);
    try {
      await updateQualityPolicy({ ...policyDraft, minDurationSec: secs });
      notify('Quality validation policy saved.');
    } catch {
      /* toasted */
    } finally {
      setPolicyBusy(false);
    }
  };

  const resetPolicy = () => {
    setPolicyDraft(qualityPolicy);
    setMinDurationInput(String(qualityPolicy.minDurationSec));
    setPolicyError('');
  };

  const clusterTotal = clusters.filter((c) => c.active).reduce((n, c) => n + c.targetHouseholds, 0);
  const dirty =
    target !== String(study.targetSample) ||
    draft.allowVolunteerDelete !== study.allowVolunteerDelete ||
    draft.requireDocumentsForSubmission !== study.requireDocumentsForSubmission;

  const save = async () => {
    const n = Number(target);
    if (!Number.isInteger(n) || n < 1 || n > 100000) return setError('Enter a whole number between 1 and 100,000.');
    setBusy(true);
    try {
      await updateStudySettings({ ...draft, targetSample: n });
      notify('Study settings saved.');
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDraft(study);
    setTarget(String(study.targetSample));
    setError('');
  };

  return (
    <div className="space-y-4">
      {!admin && <ReadOnlyNote>Study settings are managed by admins. You can view them here.</ReadOnlyNote>}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <Panel title="Study configuration" bodyClassName="px-4 pb-4 space-y-5">
          <Field
            label="Target sample (households)"
            htmlFor="st-target"
            error={error}
            hint={`Cluster targets currently add up to ${clusterTotal}. The dashboard uses the larger of the two.`}
          >
            <input
              id="st-target"
              type="number"
              min={1}
              max={100000}
              className={`${inputCls} max-w-[220px]`}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setError('');
              }}
              disabled={!admin || busy}
            />
          </Field>

          <SettingRow
            title="Volunteers may delete their own drafts"
            detail="When off, only admins can remove a draft survey. Submitted surveys can never be deleted by volunteers."
            checked={draft.allowVolunteerDelete}
            onChange={(v) => setDraft((d) => ({ ...d, allowVolunteerDelete: v }))}
            disabled={!admin || busy}
          />
          <SettingRow
            title="Require documents before submission"
            detail="Volunteers must upload every category marked “Required” before they can submit a survey."
            checked={draft.requireDocumentsForSubmission}
            onChange={(v) => setDraft((d) => ({ ...d, requireDocumentsForSubmission: v }))}
            disabled={!admin || busy}
          />

          {admin && (
            <div className="flex justify-end gap-2.5 pt-1">
              <button type="button" onClick={reset} disabled={!dirty || busy} className={btnSecondary}>
                <RotateCcw className="w-4 h-4" /> Discard
              </button>
              <button type="button" onClick={save} disabled={!dirty || busy} className={btnPrimary}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save changes
              </button>
            </div>
          )}
        </Panel>

        <Panel title="About the study" bodyClassName="px-4 pb-4">
          <dl className="space-y-2.5 text-[13px]">
            {[
              ['Organisation', STUDY_META.organization],
              ['Study', STUDY_META.studyTitle],
              ['Researchers', STUDY_META.researchers],
              ['Supervisor', STUDY_META.supervisor],
              ['Questionnaire', `Version ${STUDY_META.version}`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#726C5D]">{k}</dt>
                <dd className="text-[#181611] mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel title="Quality Validation & Submission Policy" bodyClassName="px-4 pb-4 space-y-4">
        <p className="text-[12.5px] text-[#5C5547]">
          Configure how validation rules enforce survey submission blocking, volunteer acknowledgement, and supervisor exception overrides across web, mobile, and server validation.
        </p>
        <SettingRow
          title="Block submission on critical errors"
          detail="Prevents survey submission when ERROR-severity contradictions or missing required responses remain unresolved."
          checked={policyDraft.blockOnErrors}
          onChange={(v) => setPolicyDraft((p) => ({ ...p, blockOnErrors: v }))}
          disabled={!admin || policyBusy}
        />
        <SettingRow
          title="Require verification / acknowledgement on warnings"
          detail="Requires volunteers to either fix WARNING items or confirm accuracy / record a verified field note before submitting."
          checked={policyDraft.requireWarningAcknowledgement}
          onChange={(v) => setPolicyDraft((p) => ({ ...p, requireWarningAcknowledgement: v }))}
          disabled={!admin || policyBusy}
        />
        <SettingRow
          title="Escalate verified exceptions to supervisor queue"
          detail="When volunteers mark a serious warning as verified exception in the field, automatically flag it in Supervisor Quality Insights."
          checked={policyDraft.escalateVerifiedExceptionsToSupervisor}
          onChange={(v) => setPolicyDraft((p) => ({ ...p, escalateVerifiedExceptionsToSupervisor: v }))}
          disabled={!admin || policyBusy}
        />
        <SettingRow
          title="Allow authorized supervisor overrides"
          detail="Permits supervisors and admins to waive blocking validation issues with a mandatory reason logged to the audit trail."
          checked={policyDraft.allowSupervisorOverride}
          onChange={(v) => setPolicyDraft((p) => ({ ...p, allowSupervisorOverride: v }))}
          disabled={!admin || policyBusy}
        />
        <Field
          label="Minimum plausible survey duration (seconds)"
          htmlFor="qp-mindur"
          error={policyError}
          hint="Submissions completed faster than this threshold trigger a suspicious-duration review warning (30–3600s)."
        >
          <input
            id="qp-mindur"
            type="number"
            min={30}
            max={3600}
            className={`${inputCls} max-w-[220px]`}
            value={minDurationInput}
            onChange={(e) => {
              setMinDurationInput(e.target.value);
              setPolicyError('');
            }}
            disabled={!admin || policyBusy}
          />
        </Field>
        {admin && (
          <div className="flex justify-end gap-2.5 pt-1">
            <button type="button" onClick={resetPolicy} disabled={!policyDirty || policyBusy} className={btnSecondary}>
              <RotateCcw className="w-4 h-4" /> Discard
            </button>
            <button type="button" onClick={savePolicy} disabled={!policyDirty || policyBusy} className={btnPrimary}>
              {policyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save policy
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
};

const SettingRow: React.FC<{ title: string; detail: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({
  title,
  detail,
  checked,
  onChange,
  disabled,
}) => (
  <div className="flex items-start justify-between gap-4 py-3 border-t border-[#EFECE2]">
    <div>
      <div className="text-[14px] font-semibold text-[#181611]">{title}</div>
      <div className="text-[12.5px] text-[#5C5547] mt-0.5 leading-relaxed">{detail}</div>
    </div>
    <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />
  </div>
);

/* ------------------------------------------------------------------ */
/* Document categories                                                 */
/* ------------------------------------------------------------------ */

type CatRow = DocumentCategoryConfig & { _key: string; _new?: boolean };
let keySeq = 0;
const toRows = (cats: DocumentCategoryConfig[]): CatRow[] => cats.map((c) => ({ ...c, _key: `k${keySeq++}` }));
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

const DocCategoriesTab: React.FC = () => {
  const { docCategories, documents, currentUser, updateDocCategories, notify } = useAppStore();
  const admin = isAdminRole(currentUser.role);
  const [rows, setRows] = useState<CatRow[]>(() => toRows(docCategories));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset only when the saved categories actually change (refreshes create new array references).
  const catsKey = JSON.stringify(docCategories);
  useEffect(() => {
    setRows(toRows(docCategories));
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catsKey]);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    documents.forEach((d) => m.set(d.categoryId, (m.get(d.categoryId) ?? 0) + 1));
    return m;
  }, [documents]);

  const strip = (r: CatRow[]): DocumentCategoryConfig[] =>
    r.map(({ _key, _new, ...c }) => ({
      id: c.id,
      label: c.label.trim(),
      labelHi: c.labelHi.trim(),
      enabled: c.enabled,
      requiredForSubmission: !!c.requiredForSubmission,
      requiresLast4: !!c.requiresLast4,
    }));
  const dirty = JSON.stringify(strip(rows)) !== JSON.stringify(strip(toRows(docCategories)));

  const update = (key: string, patch: Partial<CatRow>) => {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));
    setErrors((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
  };
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const next = rs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = () =>
    setRows((rs) => [...rs, { id: '', label: '', labelHi: '', enabled: true, requiredForSubmission: false, requiresLast4: false, _key: `k${keySeq++}`, _new: true }]);

  const save = async () => {
    const errs: Record<string, string> = {};
    const seen = new Set<string>();
    const prepared = rows.map((r) => (r._new && !r.id ? { ...r, id: slug(r.label) } : r));
    prepared.forEach((r) => {
      if (r.label.trim().length < 2) errs[r._key] = 'Label needs at least 2 characters.';
      else if (!/^[a-z0-9_]{2,40}$/.test(r.id)) errs[r._key] = 'ID must be 2–40 lowercase letters, digits or _.';
      else if (seen.has(r.id)) errs[r._key] = `Duplicate ID “${r.id}”.`;
      seen.add(r.id);
    });
    if (prepared.length === 0) errs.list = 'Keep at least one category.';
    setRows(prepared);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await updateDocCategories(strip(prepared));
      notify('Document categories saved.');
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  };

  const disabled = !admin || busy;

  return (
    <div className="space-y-4">
      {!admin && <ReadOnlyNote>Document categories are managed by admins. You can view them here.</ReadOnlyNote>}
      <Panel
        title="Document categories"
        titleNote={`(${rows.filter((r) => r.enabled).length} enabled)`}
        headerExtra={
          admin ? (
            <button type="button" onClick={add} disabled={busy} className={`${btnSmall} shrink-0`}>
              <Plus className="w-4 h-4" /> Add category
            </button>
          ) : undefined
        }
      >
        <p className="px-4 pb-3 text-[13px] text-[#5C5547]">
          The order here is the order volunteers see in the field app. Disable a category instead of removing it if documents already use it.
        </p>
        <div className="overflow-x-auto border-t border-[#EFECE2]">
          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-[#FAF8F2]">
              <tr className="border-b border-[#EFECE2]">
                <th className={`${thCls} pl-4 w-[84px]`}>Order</th>
                <th className={thCls}>Label (English)</th>
                <th className={thCls}>Label (Hindi)</th>
                <th className={thCls}>ID</th>
                <th className={`${thCls} text-center`}>Enabled</th>
                <th className={`${thCls} text-center`}>Required</th>
                <th className={`${thCls} text-center`}>Needs last 4</th>
                <th className={`${thCls} text-right`}>In use</th>
                <th className={`${thCls} pr-4 w-[52px]`} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const used = usage.get(r.id) ?? 0;
                return (
                  <React.Fragment key={r._key}>
                    <tr className={`border-b border-[#EFECE2] ${errors[r._key] ? '' : 'last:border-b-0'} ${r.enabled ? '' : 'bg-[#FAF8F2]'}`}>
                      <td className="pl-4 pr-2 py-2">
                        <div className="flex items-center gap-0.5">
                          <button type="button" className={iconBtn} disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${r.label} up`}>
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button type="button" className={iconBtn} disabled={disabled || i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${r.label} down`}>
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input className={`${inputCls} h-9`} value={r.label} onChange={(e) => update(r._key, { label: e.target.value })} disabled={disabled} aria-label="English label" placeholder="e.g. Ration Card" />
                      </td>
                      <td className="px-2 py-2">
                        <input className={`${inputCls} h-9`} value={r.labelHi} onChange={(e) => update(r._key, { labelHi: e.target.value })} disabled={disabled} aria-label="Hindi label" placeholder="हिन्दी नाम" />
                      </td>
                      <td className="px-2 py-2 w-[170px]">
                        {r._new ? (
                          <input
                            className={`${inputCls} h-9 font-mono text-[12.5px]`}
                            value={r.id}
                            placeholder={slug(r.label) || 'auto from label'}
                            onChange={(e) => update(r._key, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                            disabled={disabled}
                            aria-label="Category ID"
                          />
                        ) : (
                          <code className="text-[12.5px] text-[#4A4336]">{r.id}</code>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Toggle checked={r.enabled} onChange={(v) => update(r._key, { enabled: v })} disabled={disabled} label={`Enable ${r.label}`} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Toggle checked={!!r.requiredForSubmission} onChange={(v) => update(r._key, { requiredForSubmission: v })} disabled={disabled} label={`${r.label} required for submission`} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Toggle checked={!!r.requiresLast4} onChange={(v) => update(r._key, { requiresLast4: v })} disabled={disabled} label={`${r.label} requires last 4 digits`} />
                      </td>
                      <td className="px-2 py-2 text-right text-[13px] tabular-nums text-[#5C5547]">{used}</td>
                      <td className="pr-4 pl-1 py-2 text-right">
                        <button
                          type="button"
                          className={`${iconBtn} hover:text-[#C93B32]`}
                          disabled={disabled || used > 0}
                          title={used > 0 ? `${used} document(s) use this category; disable it instead.` : 'Remove'}
                          onClick={() => setRows((rs) => rs.filter((x) => x._key !== r._key))}
                          aria-label={`Remove ${r.label}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {errors[r._key] && (
                      <tr className="border-b border-[#EFECE2]">
                        <td />
                        <td colSpan={8} className="px-2 pb-2 -mt-1 text-[12px] text-[#C93B32]">
                          {errors[r._key]}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {errors.list && <p className="px-4 py-2 text-[12px] text-[#C93B32]">{errors.list}</p>}
        <div className="px-4 py-3 border-t border-[#EFECE2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[12px] text-[#726C5D]">
            “Needs last 4” asks volunteers for only the last four digits of the ID number. Full ID numbers are never stored.
          </p>
          {admin && (
            <div className="flex gap-2.5 shrink-0">
              <button type="button" onClick={() => { setRows(toRows(docCategories)); setErrors({}); }} disabled={!dirty || busy} className={btnSecondary}>
                <RotateCcw className="w-4 h-4" /> Discard
              </button>
              <button type="button" onClick={save} disabled={!dirty || busy} className={btnPrimary}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save categories
              </button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

const PreferencesTab: React.FC = () => {
  const { language, setLanguage, notify } = useAppStore();
  const options: { id: Language; label: string; native: string; detail: string }[] = [
    { id: 'en', label: 'English', native: 'English', detail: 'Questions and labels in English.' },
    { id: 'hi', label: 'Hindi', native: 'हिन्दी', detail: 'Question text, options and document names in Hindi where available.' },
  ];
  return (
    <Panel title="Language" bodyClassName="px-4 pb-4">
      <p className="text-[13px] text-[#5C5547] mb-3">
        Used for questionnaire text in survey details and analytics on this device. The admin console menus stay in English.
      </p>
      <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[640px]">
        {options.map((o) => {
          const on = language === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (on) return;
                setLanguage(o.id);
                notify(`Language set to ${o.label}.`);
              }}
              className={`text-left rounded-[12px] border p-4 transition-colors ${on ? 'border-[#D9AE00] bg-[#FFFDF4]' : 'border-[#E7E2D4] bg-white hover:bg-[#FAF8F2]'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold text-[#181611]">
                  {o.native} {o.native !== o.label && <span className="text-[13px] font-normal text-[#5C5547]">({o.label})</span>}
                </span>
                <span className={`w-[18px] h-[18px] rounded-full border-2 inline-flex items-center justify-center ${on ? 'border-[#D9AE00]' : 'border-[#D8D1BE]'}`}>
                  {on && <span className="w-2 h-2 rounded-full bg-[#FDC513]" />}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-[#5C5547]">{o.detail}</p>
            </button>
          );
        })}
      </div>
    </Panel>
  );
};
