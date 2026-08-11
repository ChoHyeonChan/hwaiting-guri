'use client';

import { FIELD_LABEL } from '@/lib/labels';
import { formatAt } from './ReviewActions';
import type { ChangeLogEntry, Item } from '@/lib/types';

const ACTION_LABEL: Record<ChangeLogEntry['action'], string> = {
  edit: '값 수정',
  approve: '승인',
  reject: '반려',
  reopen: '재검토',
  dismiss_duplicate: '중복 판단 변경',
  unapprove: '승인 해제',
};

const ACTION_STYLE: Record<ChangeLogEntry['action'], string> = {
  edit: 'bg-sky-100 text-sky-900 border-sky-300',
  approve: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  reject: 'bg-rose-100 text-rose-900 border-rose-300',
  reopen: 'bg-slate-100 text-slate-700 border-slate-300',
  dismiss_duplicate: 'bg-pink-100 text-pink-900 border-pink-300',
  unapprove: 'bg-amber-100 text-amber-900 border-amber-300',
};

/** 데이터 필드가 아닌 항목(상태·중복 판단)의 한글 이름 */
const META_FIELD_LABEL: Record<string, string> = {
  review_status: '검수 상태',
  duplicate_dismissed: '중복 판단',
};

/** 사람이 읽을 값으로 바꾼다. 상태값과 참·거짓은 영문 그대로 두면 알아보기 어렵다. */
function displayValue(field: string, value: string): string {
  if (field === 'duplicate_dismissed') return value === 'true' ? '중복 아님' : '중복 의심';
  if (field === 'review_status') {
    return { new: '승인 가능', needs_review: '확인 필요', on_hold: '보류 필요',
             approved: '승인', rejected: '반려' }[value] ?? value;
  }
  return value === '' ? '(빈 값)' : value;
}

export function ChangeLogPanel({ item }: { item: Item }) {
  const entries = [...item.change_log].reverse(); // 최근 것이 위로

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-navy">
        변경 이력 <span className="text-slate-400">({item.change_log.length}건)</span>
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        이 세션에서 사람이 값을 고치거나 승인·반려한 내역입니다.
        승인한 뒤 값이 바뀌어 승인이 풀린 경우도 여기에 남습니다.
      </p>

      {entries.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
          아직 변경한 내역이 없습니다.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {entries.map((entry, i) => (
            <li key={`${entry.at}-${i}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[11px] ${ACTION_STYLE[entry.action]}`}>
                  {ACTION_LABEL[entry.action]}
                </span>
                <span className="text-xs text-slate-600">
                  {FIELD_LABEL[entry.field] ?? META_FIELD_LABEL[entry.field] ?? entry.field}
                </span>
                <span className="ml-auto text-[11px] text-slate-400">{formatAt(entry.at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-xs">
                <span className="text-slate-500 line-through">
                  {displayValue(entry.field, entry.from)}
                </span>
                <span className="text-slate-400">→</span>
                <span className="font-semibold text-slate-900">
                  {displayValue(entry.field, entry.to)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
