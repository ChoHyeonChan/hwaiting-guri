'use client';

import type { Filters, LoadState } from '@/lib/store';
import { effectiveFlags } from '@/lib/pipeline';
import {
  FLAG_LABEL, FLAG_ORDER, FLAG_STYLE,
  STATUS_LABEL, STATUS_ORDER, STATUS_STYLE,
} from '@/lib/labels';
import type { ExceptionFlag, Item, ReviewStatus } from '@/lib/types';

interface Props {
  items: Item[];
  filtered: Item[];
  loadState: LoadState;
  filters: Filters;
  setFilters: (f: Filters) => void;
  counts: {
    byStatus: Record<ReviewStatus, number>;
    byFlag: Record<ExceptionFlag, number>;
  };
  selectedId: string | null;
  onSelect: (docId: string) => void;
}

export function InboxTable({
  items, filtered, loadState, filters, setFilters, counts, selectedId, onSelect,
}: Props) {
  const hasFilter = filters.status !== 'all' || filters.flag !== 'all';

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <h2 className="mr-2 text-sm font-semibold text-navy">검수 인박스</h2>

        <FilterGroup
          label="상태"
          active={filters.status}
          onPick={(v) => setFilters({ ...filters, status: v as ReviewStatus | 'all' })}
          options={STATUS_ORDER.map((s) => ({
            value: s, label: STATUS_LABEL[s], count: counts.byStatus[s] ?? 0,
          }))}
        />
        <FilterGroup
          label="예외"
          active={filters.flag}
          onPick={(v) => setFilters({ ...filters, flag: v as ExceptionFlag | 'all' })}
          options={FLAG_ORDER.map((f) => ({
            value: f, label: FLAG_LABEL[f], count: counts.byFlag[f] ?? 0,
          }))}
        />

        {hasFilter && (
          <button
            type="button"
            onClick={() => setFilters({ status: 'all', flag: 'all' })}
            className="ml-auto rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            필터 해제
          </button>
        )}
      </div>

      {/* loading */}
      {loadState === 'loading' && <Placeholder>파일을 읽고 있습니다…</Placeholder>}

      {/* empty - 아직 아무것도 안 올린 상태 */}
      {loadState !== 'loading' && items.length === 0 && (
        <Placeholder>
          아직 받은 자료가 없습니다.
          <br />
          <span className="text-xs">위에서 증빙 CSV 파일을 선택하면 검수 목록이 만들어집니다.</span>
        </Placeholder>
      )}

      {/* no-results - 자료는 있는데 필터에 걸리는 게 없는 상태 */}
      {loadState !== 'loading' && items.length > 0 && filtered.length === 0 && (
        <Placeholder>
          조건에 맞는 항목이 없습니다.
          <br />
          <button
            type="button"
            onClick={() => setFilters({ status: 'all', flag: 'all' })}
            className="mt-2 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            전체 {items.length}건 보기
          </button>
        </Placeholder>
      )}

      {/* success */}
      {loadState !== 'loading' && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-surface text-xs text-navy">
              <tr>
                <Th>문서ID</Th>
                <Th>공급사</Th>
                <Th>품목</Th>
                <Th>규격 / 단위</Th>
                <Th>단가</Th>
                <Th>상태</Th>
                <Th>대기 이유</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const flags = effectiveFlags(item);
                const selected = item.uid === selectedId;
                return (
                  <tr
                    key={item.uid}
                    onClick={() => onSelect(item.uid)}
                    className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                      selected ? 'bg-gold-soft hover:bg-gold-soft' : ''
                    }`}
                  >
                    <Td>
                      <span className="font-mono text-xs">{item.doc_id}</span>
                      <span className="ml-1 text-[10px] text-slate-400">
                        {item.source_ref.row_no ? `${item.source_ref.row_no}행` : '수기'}
                      </span>
                    </Td>
                    <Td>{item.current.supplier_name}</Td>
                    <Td>
                      <div>{item.current.normalized_item_name || '데이터 부족'}</div>
                      <div className="text-[11px] text-slate-400">{item.observed.raw_item_name}</div>
                    </Td>
                    <Td>
                      <div className="text-xs">{item.observed.spec}</div>
                      <div className="text-[11px] text-slate-500">{item.observed.unit}</div>
                    </Td>
                    <Td>
                      <div className="text-xs tabular-nums">
                        {fmt(item.current.price_before)} → {fmt(item.current.price_after)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {item.current.effective_date || '적용일 없음'}
                      </div>
                    </Td>
                    <Td>
                      <Badge className={STATUS_STYLE[item.review_status]}>
                        {STATUS_LABEL[item.review_status]}
                      </Badge>
                    </Td>
                    <Td>
                      {flags.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {flags.map((f) => (
                            <Badge key={f} className={FLAG_STYLE[f]}>
                              {FLAG_LABEL[f]}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FilterGroup({
  label, options, active, onPick,
}: {
  label: string;
  options: { value: string; label: string; count: number }[];
  active: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs text-slate-500">{label}</span>
      <Chip active={active === 'all'} onClick={() => onPick('all')}>전체</Chip>
      {options.map((o) => (
        <Chip key={o.value} active={active === o.value} onClick={() => onPick(o.value)}>
          {o.label} {o.count}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
        active
          ? 'border-navy bg-navy text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="whitespace-nowrap px-3 py-2 font-medium">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-top">{children}</td>
);
const Badge = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] ${className}`}>
    {children}
  </span>
);
const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="px-4 py-14 text-center text-sm text-slate-500">{children}</div>
);

function fmt(value: string): string {
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) && value !== '' ? n.toLocaleString('ko-KR') : (value || '—');
}
