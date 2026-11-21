import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Panel } from '../../components/dashboard/Panel';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAppStore } from '../../store/appStore';
import type { ClusterItem, NewUserInput, Role, SurveyStatus, UserAccount } from '../../types/survey';

/* ================================================================== */
/* Shared admin UI kit (also used by Volunteers, Clusters, Settings,  */
/* Audit log, Exports and Analytics so the screens stay consistent).  */
/* ================================================================== */

export const inputCls =
  'h-10 w-full rounded-[10px] border border-[#E7E2D4] bg-white px-3 text-[14px] text-[#181611] placeholder:text-[#8E8675] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] disabled:bg-[#FAF8F2] disabled:text-[#726C5D] disabled:cursor-not-allowed';
export const selectCls = `${inputCls} pr-8 cursor-pointer`;
export const btnPrimary =
  'h-10 px-4 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
export const btnSecondary =
  'h-10 px-4 rounded-[10px] border border-[#E7E2D4] bg-white text-[13.5px] font-semibold text-[#181611] hover:bg-[#EFECE2] inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const btnSmall =
  'h-9 px-3 rounded-[10px] border border-[#E7E2D4] bg-white text-[13px] font-semibold text-[#181611] hover:bg-[#EFECE2] inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const iconBtn =
  'w-8 h-8 rounded-lg inline-flex items-center justify-center text-[#4A4336] hover:bg-[#EFECE2] hover:text-[#181611] transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed';
export const thCls = 'px-3 py-2.5 text-[12px] font-semibold text-[#5C5547] whitespace-nowrap';
export const tdCls = 'px-3 py-2.5 text-[13.5px] text-[#181611]';

export const isAdminRole = (r: Role) => r === 'SUPER_ADMIN' || r === 'ADMIN';

export const ROLE_META: Record<Role, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', cls: 'bg-[#F0EEFB] text-[#5A45AE]' },
  ADMIN: { label: 'Admin', cls: 'bg-[#EAF1FB] text-[#2D69B3]' },
  SUPERVISOR: { label: 'Supervisor', cls: 'bg-[#FFF5E1] text-[#8A5A00]' },
  VOLUNTEER: { label: 'Volunteer', cls: 'bg-[#FFF8D6] text-[#8C6200]' },
};

export const RolePill: React.FC<{ role: Role }> = ({ role }) => (
  <span className={`inline-flex items-center h-[22px] px-2.5 rounded-md text-[11.5px] font-semibold whitespace-nowrap ${ROLE_META[role].cls}`}>
    {ROLE_META[role].label}
  </span>
);

export const ActivePill: React.FC<{ active: boolean }> = ({ active }) => (
  <span
    className={`inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-md text-[11.5px] font-medium whitespace-nowrap ${
      active ? 'bg-[#FFF5C0] text-[#8C6200]' : 'bg-[#E7E2D4] text-[#5C5547]'
    }`}
  >
    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#FDC513]' : 'bg-[#9E9683]'}`} />
    {active ? 'Active' : 'Inactive'}
  </span>
);

const SURVEY_PILL: Record<SurveyStatus, { label: string; cls: string }> = {
  SUBMITTED: { label: 'Pending Review', cls: 'bg-[#FDF0CF] text-[#8A5A00]' },
  APPROVED: { label: 'Completed', cls: 'bg-[#FFF5C0] text-[#8C6200]' },
  DRAFT: { label: 'Draft', cls: 'bg-[#E7E2D4] text-[#4A4336]' },
  PENDING_SYNC: { label: 'Pending Sync', cls: 'bg-[#E6EEF9] text-[#2D5E9E]' },
  RETURNED: { label: 'Returned', cls: 'bg-[#FDE8D8] text-[#A1460B]' },
  REJECTED: { label: 'Rejected', cls: 'bg-[#FDE2E1] text-[#B42318]' },
};

export const SurveyStatusPill: React.FC<{ status: SurveyStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center justify-center min-w-[92px] h-[22px] px-2.5 rounded-md text-[11.5px] font-medium whitespace-nowrap ${SURVEY_PILL[status].cls}`}
  >
    {SURVEY_PILL[status].label}
  </span>
);

export const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 34 }) => {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      className="rounded-full bg-[#FFF8D6] text-[#8C6200] font-bold inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
};

/** "2h ago" / "3d ago" / "—" (lastActive may be empty). */
export function timeAgo(ts: string | undefined, now = Date.now()): string {
  if (!ts) return '—';
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return ts;
  const min = Math.floor(Math.max(0, now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Same rule the API enforces. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Password must be at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers.';
  return null;
}

/** 14 chars from an unambiguous alphabet, always with upper, lower and digits. */
export function generatePassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const rand = (n: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % n;
  };
  const chars = [upper[rand(upper.length)], lower[rand(lower.length)], digits[rand(digits.length)]];
  while (chars.length < length) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export const Field: React.FC<{
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, required, hint, error, className = '', children }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="block text-[12.5px] font-semibold text-[#181611] mb-1.5">
      {label} {required && <span className="text-[#C93B32]">*</span>}
    </label>
    {children}
    {error ? (
      <p className="text-[12px] text-[#C93B32] mt-1">{error}</p>
    ) : hint ? (
      <p className="text-[12px] text-[#726C5D] mt-1">{hint}</p>
    ) : null}
  </div>
);

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  busy?: boolean;
}> = ({ checked, onChange, disabled, label, busy }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={label}
    disabled={disabled || busy}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${
      checked ? 'bg-[#FDC513]' : 'bg-[#D8D1BE]'
    } ${disabled ? 'opacity-50' : ''}`}
  >
    <span
      className={`inline-flex items-center justify-center h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-[20px]' : 'translate-x-[2px]'
      }`}
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin text-[#8C6200]" />}
    </span>
  </button>
);

export const SearchInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; className?: string }> = ({
  value,
  onChange,
  placeholder,
  className = '',
}) => (
  <div className={`relative ${className}`}>
    <Search className="w-4 h-4 text-[#726C5D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`${inputCls} pl-9`}
    />
  </div>
);

export const ReadOnlyNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2.5 rounded-[12px] border border-[#FBEACB] bg-[#FFF8EA] px-4 py-3 text-[13px] text-[#6B4A00]">
    <Lock className="w-4 h-4 mt-[1px] shrink-0" />
    <div>{children}</div>
  </div>
);

export const EmptyRow: React.FC<{ colSpan: number; text: string }> = ({ colSpan, text }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10 text-center text-[13px] text-[#5C5547]">
      {text}
    </td>
  </tr>
);

/** Centered modal (bottom sheet on phones). Escape / backdrop close unless busy. */
export const Modal: React.FC<{
  open: boolean;
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  footer?: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  children: React.ReactNode;
}> = ({ open, title, subtitle, onClose, busy, wide, footer, onSubmit, children }) => {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy, onClose]);
  if (!open) return null;
  const Wrapper: React.ElementType = onSubmit ? 'form' : 'div';
  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-[#181611]/45 backdrop-blur-[1px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <Wrapper
        {...(onSubmit ? { onSubmit, noValidate: true } : {})}
        className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] flex flex-col bg-white rounded-t-2xl sm:rounded-[14px] border border-[#E7E2D4] shadow-xl overflow-hidden`}
      >
        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-[#EFECE2]">
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold tracking-[-0.01em] text-[#181611]">{title}</h3>
            {subtitle && <div className="text-[13px] text-[#5C5547] mt-0.5">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className={iconBtn}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3.5 bg-[#FAF8F2] border-t border-[#E7E2D4] flex items-center justify-end gap-2.5">{footer}</div>
        )}
      </Wrapper>
    </div>,
    document.body
  );
};

export const PasswordInput: React.FC<{
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  invalid?: boolean;
}> = ({ id, value, onChange, placeholder, autoComplete = 'new-password', disabled, invalid }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={`${inputCls} pr-10 ${invalid ? 'border-[#E5A29C]' : ''}`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md inline-flex items-center justify-center text-[#726C5D] hover:bg-[#EFECE2]"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

export const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = 'Copy' }) => {
  const [done, setDone] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setDone(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 1600);
  };
  return (
    <button type="button" onClick={copy} disabled={!text} className={btnSmall}>
      {done ? <Check className="w-4 h-4 text-[#8C6200]" /> : <Copy className="w-4 h-4" />}
      {done ? 'Copied' : label}
    </button>
  );
};

/** Role options the signed-in user may assign (mirrors the API's assertCanManageRole). */
export function manageableRoles(me: Role): Role[] {
  if (me === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'VOLUNTEER'];
  if (me === 'ADMIN') return ['SUPERVISOR', 'VOLUNTEER'];
  return [];
}
export const canManage = (me: Role, target: Role) => manageableRoles(me).includes(target);

export const ClusterPicker: React.FC<{
  clusters: ClusterItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}> = ({ clusters, value, onChange, disabled }) => (
  <div className="flex flex-wrap gap-1.5">
    {clusters.length === 0 && <span className="text-[13px] text-[#726C5D]">No clusters yet.</span>}
    {clusters.map((c) => {
      const on = value.includes(c.id);
      return (
        <button
          key={c.id}
          type="button"
          disabled={disabled}
          aria-pressed={on}
          onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}
          className={`h-8 px-2.5 rounded-lg border text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
            on ? 'border-[#D9AE00] bg-[#FFF8D6] text-[#8C6200]' : 'border-[#E7E2D4] bg-white text-[#4A4336] hover:bg-[#FAF8F2]'
          } ${c.active ? '' : 'italic'}`}
        >
          {on && <Check className="w-3.5 h-3.5" />}
          {c.name}
          <span className="text-[11px] text-[#726C5D]">{c.code}</span>
        </button>
      );
    })}
  </div>
);

/* ------------------------------------------------------------------ */
/* Create / edit user modal (shared with the Volunteers page)          */
/* ------------------------------------------------------------------ */

type FormState = {
  name: string;
  email: string;
  mobile: string;
  role: Role;
  assignedClusterIds: string[];
  targetHouseholds: string;
  password: string;
  confirm: string;
};

export const UserFormModal: React.FC<{
  open: boolean;
  /** Edit when given, otherwise create. */
  user?: UserAccount | null;
  /** Pre-selected (and locked) role, e.g. VOLUNTEER from the Volunteers page. */
  fixedRole?: Role;
  onClose: () => void;
  onSaved?: (u: UserAccount) => void;
}> = ({ open, user, fixedRole, onClose, onSaved }) => {
  const { currentUser, clusters, createUser, updateUser, notify } = useAppStore();
  const editing = !!user;
  const self = editing && user!.id === currentUser.id;
  const roles = manageableRoles(currentUser.role);

  const initial = (): FormState => ({
    name: user?.name ?? '',
    email: user?.email ?? '',
    mobile: user?.mobile ?? '',
    role: user?.role ?? fixedRole ?? (roles.includes('VOLUNTEER') ? 'VOLUNTEER' : roles[0] ?? 'VOLUNTEER'),
    assignedClusterIds: user?.assignedClusterIds ?? [],
    targetHouseholds: user?.targetHouseholds != null ? String(user.targetHouseholds) : '',
    password: '',
    confirm: '',
  });
  const [f, setF] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setF(initial());
      setErrors({});
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const roleOptions: Role[] = editing && (self || !roles.includes(user!.role)) ? [user!.role] : fixedRole ? [fixedRole] : roles;
  const roleChanged = editing && f.role !== user!.role;
  const showTarget = f.role === 'VOLUNTEER' || f.role === 'SUPERVISOR';

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (f.name.trim().length < 2) e.name = 'Enter the full name (at least 2 characters).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
    const mobile = f.mobile.replace(/\s+/g, '');
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) e.mobile = 'Enter a 10-digit Indian mobile number (starts with 6–9).';
    if (!mobile && f.role === 'VOLUNTEER') e.mobile = 'Volunteers sign in with their mobile number.';
    if (f.targetHouseholds !== '') {
      const n = Number(f.targetHouseholds);
      if (!Number.isInteger(n) || n < 0 || n > 10000) e.targetHouseholds = 'Whole number between 0 and 10,000.';
    }
    if (!editing) {
      const p = passwordProblem(f.password);
      if (p) e.password = p;
      else if (f.password !== f.confirm) e.confirm = 'Passwords do not match.';
    }
    if (!roleOptions.includes(f.role)) e.role = 'You cannot assign this role.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy || !validate()) return;
    const mobile = f.mobile.replace(/\s+/g, '');
    const target = f.targetHouseholds === '' || !showTarget ? undefined : Number(f.targetHouseholds);
    setBusy(true);
    try {
      if (editing) {
        const u = user!;
        const patch: Parameters<typeof updateUser>[1] = {};
        if (f.name.trim() !== u.name) patch.name = f.name.trim();
        if (f.email.trim().toLowerCase() !== u.email.toLowerCase()) patch.email = f.email.trim();
        if (mobile !== (u.mobile ?? '')) patch.mobile = mobile;
        if (f.role !== u.role) patch.role = f.role;
        const sameClusters =
          f.assignedClusterIds.length === u.assignedClusterIds.length && f.assignedClusterIds.every((id) => u.assignedClusterIds.includes(id));
        if (!sameClusters) patch.assignedClusterIds = f.assignedClusterIds;
        if (target !== undefined && target !== u.targetHouseholds) patch.targetHouseholds = target;
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        const saved = await updateUser(u.id, patch);
        notify(roleChanged ? `${saved.name} updated. They have been signed out and must sign in again.` : `${saved.name} updated.`);
        onSaved?.(saved);
      } else {
        const input: NewUserInput = {
          name: f.name.trim(),
          email: f.email.trim(),
          mobile,
          role: f.role,
          assignedClusterIds: f.assignedClusterIds,
          targetHouseholds: target,
          password: f.password,
        };
        const saved = await createUser(input);
        notify(`${saved.name} added as ${ROLE_META[saved.role].label.toLowerCase()}.`);
        onSaved?.(saved);
      }
      onClose();
    } catch {
      /* store toasted the error; keep the form open */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={submit}
      title={editing ? `Edit ${user!.name}` : fixedRole === 'VOLUNTEER' ? 'Add volunteer' : 'Add user'}
      subtitle={editing ? user!.email : 'They can sign in as soon as the account is created.'}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name" htmlFor="uf-name" required error={errors.name}>
          <input id="uf-name" className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus disabled={busy} />
        </Field>
        <Field label="Email" htmlFor="uf-email" required error={errors.email}>
          <input id="uf-email" type="email" autoComplete="off" className={inputCls} value={f.email} onChange={(e) => set('email', e.target.value)} disabled={busy} />
        </Field>
        <Field label="Mobile" htmlFor="uf-mobile" required={f.role === 'VOLUNTEER'} error={errors.mobile} hint="10 digits, no country code.">
          <input
            id="uf-mobile"
            inputMode="numeric"
            maxLength={10}
            className={inputCls}
            value={f.mobile}
            onChange={(e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
            disabled={busy}
          />
        </Field>
        <Field
          label="Role"
          htmlFor="uf-role"
          required
          error={errors.role}
          hint={
            self
              ? 'You cannot change your own role.'
              : currentUser.role !== 'SUPER_ADMIN'
                ? 'Only a super admin can create or manage admins.'
                : undefined
          }
        >
          <select
            id="uf-role"
            className={selectCls}
            value={f.role}
            onChange={(e) => set('role', e.target.value as Role)}
            disabled={busy || roleOptions.length < 2}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </select>
        </Field>

        {roleChanged && (
          <div className="sm:col-span-2 flex items-start gap-2.5 rounded-[12px] border border-[#FBEACB] bg-[#FFF8EA] px-3.5 py-2.5 text-[13px] text-[#6B4A00]">
            <AlertTriangle className="w-4 h-4 mt-[1px] shrink-0" />
            <span>
              Changing the role from <strong>{ROLE_META[user!.role].label}</strong> to <strong>{ROLE_META[f.role].label}</strong> means the{' '}
              <strong>user will be signed out</strong> of every device and must sign in again.
            </span>
          </div>
        )}

        <Field
          label="Assigned clusters"
          className="sm:col-span-2"
          hint={f.role === 'VOLUNTEER' ? 'Volunteers can only survey households in these clusters.' : f.role === 'SUPERVISOR' ? 'Supervisors review work from these clusters.' : 'Admins see every cluster.'}
        >
          <ClusterPicker clusters={clusters} value={f.assignedClusterIds} onChange={(ids) => set('assignedClusterIds', ids)} disabled={busy} />
        </Field>

        {showTarget && (
          <Field label="Target households" htmlFor="uf-target" error={errors.targetHouseholds} hint="Optional personal target.">
            <input
              id="uf-target"
              type="number"
              min={0}
              max={10000}
              className={inputCls}
              value={f.targetHouseholds}
              onChange={(e) => set('targetHouseholds', e.target.value)}
              disabled={busy}
            />
          </Field>
        )}

        {!editing && (
          <>
            <div className="sm:col-span-2 h-px bg-[#EFECE2]" />
            <Field label="Password" htmlFor="uf-pass" required error={errors.password} hint="At least 10 characters with letters and digits.">
              <PasswordInput id="uf-pass" value={f.password} onChange={(v) => set('password', v)} disabled={busy} invalid={!!errors.password} />
            </Field>
            <Field label="Confirm password" htmlFor="uf-confirm" required error={errors.confirm}>
              <PasswordInput id="uf-confirm" value={f.confirm} onChange={(v) => set('confirm', v)} disabled={busy} invalid={!!errors.confirm} />
            </Field>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btnSmall}
                disabled={busy}
                onClick={() => {
                  const p = generatePassword();
                  setF((s) => ({ ...s, password: p, confirm: p }));
                  setErrors((e) => ({ ...e, password: undefined, confirm: undefined }));
                }}
              >
                <RefreshCw className="w-4 h-4" /> Generate strong password
              </button>
              {f.password && f.password === f.confirm && !passwordProblem(f.password) && <CopyButton text={f.password} label="Copy password" />}
              <span className="text-[12px] text-[#726C5D]">Share it privately; it is never shown again.</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Reset password modal                                                */
/* ------------------------------------------------------------------ */

export const ResetPasswordModal: React.FC<{ user: UserAccount | null; onClose: () => void }> = ({ user, onClose }) => {
  const { resetUserPassword, notify } = useAppStore();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setPw(generatePassword());
      setError('');
      setBusy(false);
    }
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    const p = passwordProblem(pw);
    if (p) return setError(p);
    setBusy(true);
    try {
      await resetUserPassword(user.id, pw);
      notify(`Password reset for ${user.name}. They have been signed out everywhere.`);
      onClose();
    } catch {
      /* toasted by the store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      busy={busy}
      onSubmit={submit}
      title="Reset password"
      subtitle={user ? `${user.name} · ${user.email}` : undefined}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Reset password
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="New password" htmlFor="rp-pass" required error={error} hint="At least 10 characters with letters and digits.">
          <PasswordInput
            id="rp-pass"
            value={pw}
            onChange={(v) => {
              setPw(v);
              setError('');
            }}
            disabled={busy}
            invalid={!!error}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSmall} onClick={() => { setPw(generatePassword()); setError(''); }} disabled={busy}>
            <RefreshCw className="w-4 h-4" /> Generate
          </button>
          <CopyButton text={pw} label="Copy" />
        </div>
        <p className="text-[12.5px] text-[#5C5547] leading-relaxed">
          Copy the password before saving and share it with the user privately. Their existing sessions end immediately.
        </p>
      </div>
    </Modal>
  );
};

/** Activate / deactivate with confirmation; guards self-deactivation and the super-admin rule. */
export function useActiveToggle() {
  const { currentUser, setUserActive, notify } = useAppStore();
  const [pending, setPending] = useState<UserAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const blockedReason = (u: UserAccount): string | null => {
    if (u.id === currentUser.id) return 'You cannot deactivate your own account.';
    if (!canManage(currentUser.role, u.role)) return 'Only a super admin can manage admin accounts.';
    return null;
  };

  const run = async (u: UserAccount, active: boolean) => {
    setBusyId(u.id);
    try {
      await setUserActive(u.id, active);
      notify(active ? `${u.name} reactivated.` : `${u.name} deactivated and signed out.`);
    } finally {
      setBusyId(null);
    }
  };

  const request = (u: UserAccount, active: boolean) => {
    if (blockedReason(u)) return;
    if (active) run(u, true).catch(() => undefined);
    else setPending(u);
  };

  const dialog = (
    <ConfirmDialog
      open={!!pending}
      title={`Deactivate ${pending?.name ?? ''}?`}
      description="They will be signed out immediately and cannot sign in until reactivated. Their surveys and documents are kept."
      confirmLabel="Deactivate"
      variant="danger"
      onCancel={() => setPending(null)}
      onConfirm={async () => {
        if (!pending) return;
        await run(pending, false);
        setPending(null);
      }}
    />
  );

  return { request, busyId, blockedReason, dialog };
}

/* ================================================================== */
/* Users & Roles page                                                  */
/* ================================================================== */

const ROLE_ORDER: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'VOLUNTEER'];

export const AdminUsers: React.FC = () => {
  const { users, clusters, currentUser } = useAppStore();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [resetting, setResetting] = useState<UserAccount | null>(null);
  const toggle = useActiveToggle();

  const clusterById = useMemo(() => new Map(clusters.map((c) => [c.id, c])), [clusters]);
  const counts = useMemo(() => {
    const m: Record<Role, number> = { SUPER_ADMIN: 0, ADMIN: 0, SUPERVISOR: 0, VOLUNTEER: 0 };
    users.forEach((u) => (m[u.role] += 1));
    return m;
  }, [users]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => roleFilter === 'ALL' || u.role === roleFilter)
      .filter((u) => statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? u.active : !u.active))
      .filter((u) => !q || [u.name, u.email, u.mobile].some((v) => (v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  }, [users, query, roleFilter, statusFilter]);

  const isSuper = currentUser.role === 'SUPER_ADMIN';

  return (
    <AdminLayout title="Users & Roles" subtitle="Manage who can sign in, what they can do and which clusters they cover.">
      {/* Role summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:gap-4">
        {ROLE_ORDER.map((r) => {
          const on = roleFilter === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(on ? 'ALL' : r)}
              aria-pressed={on}
              className={`h-[74px] rounded-[14px] border px-4 flex items-center justify-between text-left transition ${
                on ? 'border-[#D9AE00] bg-[#FFF8D6]' : 'border-[#E7E2D4] bg-white hover:-translate-y-[1px] hover:shadow-[0_6px_16px_-8px_rgba(24,22,17,0.25)]'
              }`}
            >
              <span>
                <span className="block text-[25px] leading-none font-bold tracking-[-0.02em] text-[#181611] tabular-nums">{counts[r]}</span>
                <span className="block mt-1.5 text-[13.5px] text-[#181611]">{ROLE_META[r].label}s</span>
              </span>
              <RolePill role={r} />
            </button>
          );
        })}
      </div>

      {!isSuper && (
        <ReadOnlyNote>
          You can add and manage <strong>supervisors</strong> and <strong>volunteers</strong>. Only a super admin can create or modify admin accounts.
        </ReadOnlyNote>
      )}

      <Panel
        title="All users"
        titleNote={`(${rows.length} of ${users.length})`}
        headerExtra={
          <button type="button" onClick={() => setCreating(true)} className={`${btnPrimary} h-9 shrink-0`}>
            <UserPlus className="w-4 h-4" /> Add user
          </button>
        }
      >
        <div className="px-4 pb-3 flex flex-col md:flex-row gap-2.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or mobile" className="flex-1" />
          <select className={`${selectCls} md:w-44`} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | 'ALL')} aria-label="Filter by role">
            <option value="ALL">All roles</option>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </select>
          <select
            className={`${selectCls} md:w-40`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Filter by status"
          >
            <option value="ALL">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        <div className="hidden md:block overflow-x-auto border-t border-[#EFECE2]">
          <table className="w-full text-left min-w-[860px]">
            <thead className="bg-[#FAF8F2]">
              <tr className="border-b border-[#EFECE2]">
                <th className={`${thCls} pl-4`}>User</th>
                <th className={thCls}>Mobile</th>
                <th className={thCls}>Role</th>
                <th className={thCls}>Clusters</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Last active</th>
                <th className={`${thCls} pr-4 text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={7} text="No users match these filters." />}
              {rows.map((u) => {
                const self = u.id === currentUser.id;
                const manageable = canManage(currentUser.role, u.role);
                const editable = manageable || self;
                const blocked = toggle.blockedReason(u);
                const names = u.assignedClusterIds.map((id) => clusterById.get(id)?.name ?? id);
                return (
                  <tr key={u.id} className={`border-b last:border-b-0 border-[#EFECE2] hover:bg-[#FAF8F2] ${u.active ? '' : 'opacity-70'}`}>
                    <td className={`${tdCls} pl-4`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={u.name} />
                        <div className="min-w-0">
                          <div className="font-semibold truncate flex items-center gap-1.5">
                            {u.name}
                            {self && <span className="text-[11px] font-semibold text-[#8C6200] bg-[#FFF8D6] rounded px-1.5">You</span>}
                          </div>
                          <div className="text-[12.5px] text-[#726C5D] truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`${tdCls} tabular-nums whitespace-nowrap`}>{u.mobile || <span className="text-[#8E8675]">—</span>}</td>
                    <td className={tdCls}>
                      <RolePill role={u.role} />
                    </td>
                    <td className={`${tdCls} max-w-[240px]`}>
                      {isAdminRole(u.role) ? (
                        <span className="text-[12.5px] text-[#726C5D]">All clusters</span>
                      ) : names.length === 0 ? (
                        <span className="text-[12.5px] text-[#B26B00]">None assigned</span>
                      ) : (
                        <span className="text-[13px] line-clamp-2" title={names.join(', ')}>
                          {names.join(', ')}
                        </span>
                      )}
                    </td>
                    <td className={tdCls}>
                      <ActivePill active={u.active} />
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-[#5C5547]`} title={u.lastActive ? new Date(u.lastActive).toLocaleString() : undefined}>
                      {timeAgo(u.lastActive)}
                    </td>
                    <td className={`${tdCls} pr-4`}>
                      <div className="flex items-center justify-end gap-1">
                        {!editable && (
                          <span title="Only a super admin can manage admin accounts." className="w-8 h-8 inline-flex items-center justify-center text-[#9E9683]">
                            <ShieldCheck className="w-4 h-4" />
                          </span>
                        )}
                        <button type="button" className={iconBtn} disabled={!editable} onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className={iconBtn}
                          disabled={!manageable}
                          onClick={() => setResetting(u)}
                          aria-label={`Reset password for ${u.name}`}
                          title={manageable ? 'Reset password' : 'Only a super admin can manage admin accounts.'}
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <span title={blocked ?? (u.active ? 'Deactivate' : 'Reactivate')} className="ml-1 inline-flex">
                          <Toggle
                            checked={u.active}
                            disabled={!!blocked}
                            busy={toggle.busyId === u.id}
                            label={u.active ? `Deactivate ${u.name}` : `Reactivate ${u.name}`}
                            onChange={(v) => toggle.request(u, v)}
                          />
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="md:hidden border-t border-[#EFECE2] divide-y divide-[#EFECE2]">
          {rows.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-[#5C5547]">No users match these filters.</li>
          )}
          {rows.map((u) => {
            const self = u.id === currentUser.id;
            const manageable = canManage(currentUser.role, u.role);
            const editable = manageable || self;
            const blocked = toggle.blockedReason(u);
            const names = u.assignedClusterIds.map((id) => clusterById.get(id)?.name ?? id);
            return (
              <li key={u.id} className={`p-4 space-y-2.5 ${u.active ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={u.name} />
                    <div className="min-w-0">
                      <div className="font-semibold text-[14px] truncate flex items-center gap-1.5">
                        {u.name}
                        {self && <span className="text-[11px] font-semibold text-[#8C6200] bg-[#FFF8D6] rounded px-1.5">You</span>}
                      </div>
                      <div className="text-[12px] text-[#726C5D] truncate">{u.email}</div>
                      {u.mobile && <div className="text-[12px] text-[#726C5D] tabular-nums">{u.mobile}</div>}
                    </div>
                  </div>
                  <Toggle
                    checked={u.active}
                    disabled={!!blocked}
                    busy={toggle.busyId === u.id}
                    label={u.active ? `Deactivate ${u.name}` : `Reactivate ${u.name}`}
                    onChange={(v) => toggle.request(u, v)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <RolePill role={u.role} />
                  <ActivePill active={u.active} />
                  <span className="text-[#726C5D] ml-auto">{timeAgo(u.lastActive)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="text-[12px] text-[#5C5547] min-w-0 truncate">
                    {isAdminRole(u.role) ? 'All clusters' : names.length ? names.join(', ') : 'No clusters assigned'}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" className={iconBtn} disabled={!editable} onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" className={iconBtn} disabled={!manageable} onClick={() => setResetting(u)} aria-label={`Reset password for ${u.name}`}>
                      <KeyRound className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="flex items-start gap-2 text-[12.5px] text-[#726C5D] px-1">
        <Power className="w-4 h-4 mt-[1px] shrink-0" />
        Deactivating a user, resetting their password or changing their role signs them out of every device immediately.
      </div>

      <UserFormModal open={creating} onClose={() => setCreating(false)} />
      <UserFormModal open={!!editing} user={editing} onClose={() => setEditing(null)} />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
      {toggle.dialog}
    </AdminLayout>
  );
};
