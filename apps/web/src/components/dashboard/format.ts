const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

/** Income before eviction: exact amount if recorded, otherwise the midpoint of the coded bracket. */
export function incomeBefore(approx?: string, code?: string): string {
  const num = approx ? Number(approx.replace(/[^\d.]/g, '')) : 0;
  if (num > 0) return inr(num);
  if (approx?.trim()) return approx.trim();
  const bracket: Record<string, number> = { '1': 2500, '2': 4500, '3': 8000, '4': 15000, '5': 25000 };
  return code && bracket[code] ? inr(bracket[code]) : '—';
}

/** Income now, from B9 Assam income classification. */
export function incomeNow(code: string, _beforeApprox?: string): string {
  if (code === '1') return '< ₹3,000';
  if (code === '2') return '₹3k–6k';
  if (code === '3') return '₹6k–10k';
  if (code === '4') return '₹10k–20k';
  if (code === '5') return '> ₹20k';
  return '—';
}

/** "2026-11-09" → "Nov 9, 2026" */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d || !MONTHS[m - 1]) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "2026-11-09" → "Nov 9" */
export function dayLabel(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}` : iso;
}

/** Accepts ISO timestamps or pre-formatted strings ("2 minutes ago"). */
export function relativeTime(ts: string, now = Date.now()): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(ts)) return ts;
  const diff = Math.max(0, now - new Date(ts).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.round(hr / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
