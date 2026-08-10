'use client';

import { canApprove, effectiveFlags } from '@/lib/pipeline';
import { FLAG_LABEL } from '@/lib/labels';
import type { Item } from '@/lib/types';

interface Props {
  item: Item;
  onApprove: (docId: string) => void;
  onReject: (docId: string) => void;
  onReopen: (docId: string) => void;
  onToggleDuplicate: (docId: string) => void;
  onMemo: (docId: string, memo: string) => void;
}

export function ReviewActions({
  item, onApprove, onReject, onReopen, onToggleDuplicate, onMemo,
}: Props) {
  const decided = item.review_status === 'approved' || item.review_status === 'rejected';
  const approvable = canApprove(item);
  const isDuplicate = item.duplicate_of !== null;
  const blocking = effectiveFlags(item).filter((f) => f === 'missing_required');

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">검수</h3>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApprove(item.doc_id)}
          disabled={!approvable || item.review_status === 'approved'}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          승인
        </button>
        <button
          type="button"
          onClick={() => onReject(item.doc_id)}
          disabled={item.review_status === 'rejected'}
          className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          반려
        </button>
        {decided && (
          <button
            type="button"
            onClick={() => onReopen(item.doc_id)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            재검토
          </button>
        )}
      </div>

      {/* 승인이 막힌 이유를 버튼 옆에 그대로 적는다 */}
      {!approvable && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          {blocking.map((f) => FLAG_LABEL[f]).join(', ')} 상태입니다. 비어 있는 값을 채우면 승인할 수 있습니다.
        </p>
      )}

      {/* 중복 의심을 사람이 되돌릴 수 있는 경로. 자동으로 합치거나 지우지 않는다. */}
      {(isDuplicate || item.duplicate_dismissed) && (
        <div className="mt-3 rounded-md border border-pink-200 bg-pink-50 p-3">
          {item.duplicate_dismissed ? (
            <>
              <p className="text-xs text-pink-900">
                사람이 <b>중복 아님</b>으로 되돌린 항목입니다. 중복 의심은 상태 계산에서 제외됩니다.
              </p>
              <button
                type="button"
                onClick={() => onToggleDuplicate(item.doc_id)}
                className="mt-2 rounded-md border border-pink-300 bg-white px-2.5 py-1 text-xs text-pink-900 hover:bg-pink-100"
              >
                다시 중복으로 보기
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-pink-900">
                같은 품목을 같은 날 두 번 발주하는 경우도 있습니다. 정상 건이라면 되돌려 주세요.
              </p>
              <button
                type="button"
                onClick={() => onToggleDuplicate(item.doc_id)}
                className="mt-2 rounded-md border border-pink-300 bg-white px-2.5 py-1 text-xs text-pink-900 hover:bg-pink-100"
              >
                중복 아님으로 되돌리기
              </button>
            </>
          )}
        </div>
      )}

      <label className="mt-3 block">
        <span className="text-xs text-slate-500">검수 메모</span>
        <textarea
          key={`${item.doc_id}:memo`}
          defaultValue={item.review_memo}
          onBlur={(e) => onMemo(item.doc_id, e.target.value)}
          rows={2}
          placeholder="판단 근거나 공급사에 확인할 내용을 적어 주세요."
          className="mt-1 w-full resize-y rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-500"
        />
      </label>

      {item.reviewed_at && (
        <p className="mt-1 text-[11px] text-slate-400">
          최종 처리 {formatAt(item.reviewed_at)}
        </p>
      )}
    </section>
  );
}

export function formatAt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
