import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => React.ReactNode;
  /** Extra classes for both th and td (e.g. "hidden xl:table-cell"). */
  className?: string;
  /** Hide this column in the generic mobile card. */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  page?: number;
  pageSize?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  renderMobileCard?: (row: T) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Row selection (checkbox column). Pass both to enable. */
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  /** Rendered above the table inside the card (tabs, bulk bars…). */
  header?: React.ReactNode;
  /** Render without the outer card (when nested inside a Panel). */
  bare?: boolean;
  /** Label for the pagination summary, e.g. "surveys". */
  itemLabel?: string;
}

const alignCls = (a?: 'left' | 'center' | 'right') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  sortKey,
  sortDir = 'desc',
  onSort,
  page = 1,
  pageSize = 10,
  totalItems,
  onPageChange,
  onRowClick,
  renderMobileCard,
  emptyTitle = 'No matching records',
  emptyDescription = 'Try adjusting your search or filter criteria.',
  selectedKeys,
  onSelectionChange,
  header,
  bare = false,
  itemLabel = 'records',
}: DataTableProps<T>) {
  const selectable = !!selectedKeys && !!onSelectionChange;
  const total = totalItems ?? data.length;
  const pageKeys = data.map(keyExtractor);
  const allOnPage = selectable && pageKeys.length > 0 && pageKeys.every((k) => selectedKeys!.includes(k));
  const someOnPage = selectable && !allOnPage && pageKeys.some((k) => selectedKeys!.includes(k));

  const toggleAll = () => {
    if (!selectable) return;
    onSelectionChange!(
      allOnPage
        ? selectedKeys!.filter((k) => !pageKeys.includes(k))
        : Array.from(new Set([...selectedKeys!, ...pageKeys]))
    );
  };
  const toggle = (k: string) => {
    if (!selectable) return;
    onSelectionChange!(selectedKeys!.includes(k) ? selectedKeys!.filter((x) => x !== k) : [...selectedKeys!, k]);
  };

  const wrapper = bare
    ? 'min-w-0'
    : 'bg-white border border-[#E7E2D4] rounded-[14px] shadow-[0_1px_2px_rgba(24,22,17,0.04)] overflow-hidden min-w-0';

  return (
    <div className={wrapper}>
      {header}
      {data.length === 0 ? (
        <EmptyState bare title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11.5px] font-semibold text-[#181611] border-b border-[#EFECE2] bg-[#FAF8F2]">
                  {selectable && (
                    <th className="pl-4 pr-1 py-2.5 w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allOnPage}
                        ref={(el) => {
                          if (el) el.indeterminate = someOnPage;
                        }}
                        onChange={toggleAll}
                        className="m2s-check"
                      />
                    </th>
                  )}
                  {columns.map((col, i) => {
                    const active = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={`${i === 0 && !selectable ? 'pl-4' : 'pl-2.5'} pr-2.5 py-2.5 whitespace-nowrap ${alignCls(col.align)} ${col.className ?? ''}`}
                      >
                        {col.sortable && onSort ? (
                          <button
                            type="button"
                            onClick={() => onSort(col.key)}
                            className={`inline-flex items-center gap-1 transition-colors ${
                              active ? 'text-[#8C6200]' : 'hover:text-[#6E4D00]'
                            }`}
                          >
                            {col.header}
                            {active ? (
                              sortDir === 'asc' ? (
                                <ArrowUp className="w-3 h-3" strokeWidth={2.4} />
                              ) : (
                                <ArrowDown className="w-3 h-3" strokeWidth={2.4} />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-[#9E9683]" strokeWidth={2.2} />
                            )}
                          </button>
                        ) : (
                          col.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="text-[13px] text-[#181611]">
                {data.map((row) => {
                  const k = keyExtractor(row);
                  const checked = selectable && selectedKeys!.includes(k);
                  return (
                    <tr
                      key={k}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={`border-b last:border-b-0 border-[#EFECE2] transition-colors ${
                        checked ? 'bg-[#FFF8D6]' : 'hover:bg-[#FAF8F2]'
                      } ${onRowClick ? 'cursor-pointer' : ''}`}
                    >
                      {selectable && (
                        <td className="pl-4 pr-1 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label="Select row"
                            checked={checked}
                            onChange={() => toggle(k)}
                            className="m2s-check"
                          />
                        </td>
                      )}
                      {columns.map((col, i) => (
                        <td
                          key={col.key}
                          className={`${i === 0 && !selectable ? 'pl-4' : 'pl-2.5'} pr-2.5 py-2 align-middle ${alignCls(col.align)} ${col.className ?? ''}`}
                        >
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-[#EFECE2]">
            {data.map((row) => {
              const k = keyExtractor(row);
              const checked = selectable && selectedKeys!.includes(k);
              return (
                <li key={k} className={`flex items-start gap-3 px-4 py-3 ${checked ? 'bg-[#FFF8D6]' : ''}`}>
                  {selectable && (
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={checked}
                      onChange={() => toggle(k)}
                      className="m2s-check mt-1 shrink-0"
                    />
                  )}
                  <div
                    className={`flex-1 min-w-0 ${onRowClick ? 'cursor-pointer' : ''}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {renderMobileCard ? (
                      renderMobileCard(row)
                    ) : (
                      <div className="space-y-1.5">
                        {columns
                          .filter((c) => !c.hideOnMobile)
                          .map((col) => (
                            <div key={col.key} className="flex items-center justify-between gap-3 text-[13px]">
                              <span className="text-[12px] font-medium text-[#726C5D]">{col.header}</span>
                              <div className="text-right min-w-0">{col.render(row)}</div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {onPageChange && total > 0 && (
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} itemLabel={itemLabel} />
      )}
    </div>
  );
}

/** Footer pager used by DataTable and by grid views. */
export const Pagination: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
}> = ({ page, pageSize, total, onPageChange, itemLabel = 'records', className = '' }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Compact page list: 1 … p-1 p p+1 … N
  const pages: (number | '…')[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  const btn =
    'h-8 min-w-[32px] px-2 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center transition-colors';

  return (
    <div
      className={`px-4 py-2.5 border-t border-[#EFECE2] flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[#5C5547] ${className}`}
    >
      <span>
        Showing <strong className="font-semibold text-[#181611] tabular-nums">{from}–{to}</strong> of{' '}
        <strong className="font-semibold text-[#181611] tabular-nums">{total}</strong> {itemLabel}
      </span>
      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
            className={`${btn} border border-[#E7E2D4] bg-white text-[#181611] hover:bg-[#EFECE2] disabled:opacity-40 disabled:hover:bg-white`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="px-1 text-[#8E8675]">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                className={`${btn} tabular-nums ${
                  p === page ? 'bg-[#FDC513] text-[#181611]' : 'text-[#181611] hover:bg-[#EFECE2]'
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            className={`${btn} border border-[#E7E2D4] bg-white text-[#181611] hover:bg-[#EFECE2] disabled:opacity-40 disabled:hover:bg-white`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </nav>
      )}
    </div>
  );
};
