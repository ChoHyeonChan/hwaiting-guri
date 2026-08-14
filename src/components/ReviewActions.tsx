'use client';

import { useState } from 'react';
import { approvalBlock } from '@/lib/pipeline';
import type { Item } from '@/lib/types';

/** 인자는 전부 uid다. 문서ID는 재업로드로 중복돼 항목을 특정하지 못한다. */
interface Props {
  item: Item;
  onApprove: (uid: string) => void;
  onReject: (uid: string) => void;
  onReopen: (uid: string) => void;
  onToggleDuplicate: (uid: string) => void;
  onMemo: (uid: string, memo: string) => void;
}

export function ReviewActions({
  item, onApprove, onReject, onReopen, onToggleDuplicate, onMemo,
}: Props) {
  const decided = item.review_status === 'approved' || item.review_status === 'rejected';
  const block = approvalBlock(item);
  const isDuplicate = item.duplicate_of !== null;
  const approved = item.review_status === 'approved';

  /**
   * 승인을 누른 순간 아직 막혀 있었으면 사유를 눈에 띄게 한다.
   *
   * 항목을 옮기면 부모가 uid를 key로 새로 그리므로 이 표시는 따라오지 않는다.
   */
  const [nudged, setNudged] = useState(false);

  /**
   * 입력란에서 곧바로 눌러도 한 번에 먹히게 하는 버튼 속성.
   *
   * 값과 메모는 포커스가 빠질 때 커밋된다. 그래서 입력 도중 이 버튼을 누르면
   * 브라우저가 mousedown에서 포커스를 옮기고, 그 blur가 목록 전체를 다시 계산해
   * 버튼이 다시 그려진다. mousedown과 mouseup을 받은 요소가 달라지므로 브라우저는
   * click을 발생시키지 않고, 결국 눌러도 아무 일이 없다. 실제로 이벤트를 찍어 보면
   * `mousedown -> blur`에서 끊기고 click이 오지 않는다.
   *
   * 그래서 mousedown의 기본 동작(포커스 이동)을 막아 이 경합 자체를 없애고,
   * 커밋은 click 안에서 직접 일으킨다. blur()는 그 자리에서 처리되므로 이어지는
   * 요청은 커밋된 값을 본 뒤에 나간다.
   */
  const commitThenRun = (run: () => void) => ({
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => {
      (document.activeElement as HTMLElement | null)?.blur();
      run();
    },
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-navy">검수</h3>

      <div className="mt-2 flex flex-wrap gap-2">
        {/*
          승인이 막혀 있어도 disabled로 두지 않는다. 값을 고쳐 조건을 막 채운 순간에도
          같은 클릭으로 승인까지 가야 하는데, disabled면 그 클릭이 버려진다.

          승인 여부를 여기서 판정하지도 않는다. 이 자리의 block은 커밋 직전에 계산된
          값이라, 방금 채운 조건이 반영돼 있지 않다. 판정은 최신 목록을 쥔 store에
          맡기고(review.approve가 canApprove를 검사한다) 여기서는 요청만 보낸다.
        */}
        <button
          type="button"
          {...commitThenRun(() => {
            if (approved) return;
            onApprove(item.uid);
            // 승인됐다면 차단 사유 자체가 사라지므로 이 표시는 드러나지 않는다.
            setNudged(true);
          })}
          aria-disabled={block !== null || approved}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            block !== null || approved
              ? 'cursor-not-allowed bg-slate-200 text-slate-400'
              : 'bg-navy text-white hover:bg-navy-mid'
          }`}
        >
          승인
        </button>
        <button
          type="button"
          {...commitThenRun(() => onReject(item.uid))}
          disabled={item.review_status === 'rejected'}
          className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          반려
        </button>
        {decided && (
          <button
            type="button"
            {...commitThenRun(() => onReopen(item.uid))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            재검토
          </button>
        )}
      </div>

      {/* 승인이 막힌 이유를 버튼 아래에 그대로 적는다. 승인을 눌렀다면 강조한다 */}
      {block && (
        <p
          className={`mt-2 rounded-md border px-2.5 py-1.5 text-xs ${
            nudged
              ? 'border-amber-500 bg-amber-100 font-medium text-amber-950 ring-2 ring-amber-300'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          {block.detail}
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
                {...commitThenRun(() => onToggleDuplicate(item.uid))}
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
                {...commitThenRun(() => onToggleDuplicate(item.uid))}
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
          key={`${item.uid}:memo`}
          defaultValue={item.review_memo}
          onBlur={(e) => onMemo(item.uid, e.target.value)}
          rows={2}
          placeholder="판단 근거나 공급사에 확인할 내용을 적어 주세요."
          className="mt-1 w-full resize-y rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-navy"
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
