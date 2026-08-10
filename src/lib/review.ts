import { canApprove } from './pipeline';
import type { ChangeLogEntry, CurrentFields, Item } from './types';

/**
 * 사람 검수 동작. 전부 항목 하나를 받아 새 항목을 돌려주는 순수 함수다.
 * 예외 재판정과 중복 재계산은 목록 전체를 봐야 하므로 호출한 쪽에서
 * recomputeItems로 이어서 처리한다.
 *
 * 자동 승인·자동 병합은 여기 없다. 모든 상태 변화는 사람이 누른 결과다.
 */

function log(item: Item, entry: ChangeLogEntry): Item {
  return { ...item, change_log: [...item.change_log, entry] };
}

/** 값 수정. 관찰값(observed)은 건드리지 않고 current만 바꾼다. */
export function editField(
  item: Item,
  field: keyof CurrentFields,
  value: string,
  at: string,
): Item {
  const before = item.current[field];
  if (before === value) return item;

  const edited: Item = { ...item, current: { ...item.current, [field]: value } };

  // 정규화 품목명을 사람이 고쳤으면 더 이상 자동 후보가 아니다.
  const normalization =
    field === 'normalized_item_name'
      ? { source: 'rule' as const, candidate: value }
      : item.normalization;

  return log({ ...edited, normalization }, {
    at,
    field,
    from: before,
    to: value,
    action: 'edit',
  });
}

/**
 * 승인. 필수값이 비어 있으면 승인할 수 없다(요건 명시).
 * 화면에서도 버튼을 막지만, 함수 차원에서도 한 번 더 막는다.
 */
export function approve(item: Item, at: string): Item {
  if (!canApprove(item)) return item;
  return log(
    { ...item, review_status: 'approved', reviewed_at: at },
    { at, field: 'review_status', from: item.review_status, to: 'approved', action: 'approve' },
  );
}

export function reject(item: Item, at: string): Item {
  return log(
    { ...item, review_status: 'rejected', reviewed_at: at },
    { at, field: 'review_status', from: item.review_status, to: 'rejected', action: 'reject' },
  );
}

/**
 * 재검토. 승인·반려를 되돌려 다시 판정받게 한다.
 * review_status를 new로 되돌리면 recomputeItems가 예외에 맞는 상태로 다시 계산한다.
 */
export function reopen(item: Item, at: string): Item {
  if (item.review_status !== 'approved' && item.review_status !== 'rejected') return item;
  return log(
    { ...item, review_status: 'new', reviewed_at: null },
    { at, field: 'review_status', from: item.review_status, to: 'new', action: 'reopen' },
  );
}

/**
 * 중복 아님으로 되돌리기 / 다시 중복으로 보기.
 *
 * 같은 품목을 같은 날 두 번 발주하는 경우가 실제로 있어서, 중복처럼 보이는
 * 두 건이 정상인 경우가 있다. 사람이 되돌려 정상 검수 흐름에 복귀시킬 수 있어야 한다.
 */
export function toggleDuplicateDismissed(item: Item, at: string): Item {
  const next = !item.duplicate_dismissed;
  return log(
    { ...item, duplicate_dismissed: next },
    {
      at,
      field: 'duplicate_dismissed',
      from: String(item.duplicate_dismissed),
      to: String(next),
      action: 'dismiss_duplicate',
    },
  );
}

/** 검수 메모. 이력에는 남기지 않는다. 판단 근거를 적는 자유 입력란이다. */
export function setMemo(item: Item, memo: string): Item {
  return item.review_memo === memo ? item : { ...item, review_memo: memo };
}
