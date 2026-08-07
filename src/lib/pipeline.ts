import {
  COLUMN_TO_FIELD,
  REQUIRED_COLUMNS,
  type Item,
  type ItemFields,
  type ReviewStatus,
} from './types';
import { normalizeItemName } from './normalize';
import { detectRowExceptions, detectDuplicates } from './detect';
import type { ParsedRow } from './parseCsv';

/**
 * 파싱된 행 -> 검수 대상 Item 목록.
 *
 * 순서: 필드 매핑 -> 정규화 후보 -> 항목 단위 예외 -> 중복 -> 상태 결정
 * 중복은 정규화 품목명을 키에 쓰므로 정규화 뒤에 와야 한다.
 */
export function buildItems(rows: ParsedRow[], fileName: string): Item[] {
  const items = rows.map((row) => buildItem(row, fileName));

  detectDuplicates(items);
  for (const item of items) {
    item.review_status = decideStatus(item);
  }

  return items;
}

function buildItem(row: ParsedRow, fileName: string): Item {
  const observed = {} as ItemFields;
  let docId = '';

  for (const column of REQUIRED_COLUMNS) {
    const field = COLUMN_TO_FIELD[column];
    const value = row.values[column] ?? '';
    if (field === 'doc_id') docId = value;
    else observed[field] = value;
  }

  const normalization = normalizeItemName(observed.raw_item_name);

  const item: Item = {
    doc_id: docId,
    source_ref: { input_method: 'file', file_name: fileName, row_no: row.rowNo },
    observed,
    current: { ...observed, normalized_item_name: normalization.candidate },
    normalization,
    spec_change: null,
    duplicate_of: null,
    duplicate_members: [],
    duplicate_dismissed: false,
    exception_flags: [],
    exception_reasons: {},
    review_status: 'new',
    review_memo: '',
    reviewed_at: null,
    change_log: [],
  };

  const outcome = detectRowExceptions(item);
  item.exception_flags = outcome.flags;
  item.exception_reasons = outcome.reasons;
  item.spec_change = outcome.specChange;

  return item;
}

/**
 * 상태 결정 규칙.
 *
 *   missing_required 있음                      -> needs_review (확인 필요)
 *   없고 spec/unit/duplicate 중 하나라도 있음   -> on_hold      (보류 필요)
 *   아무 플래그 없음                            -> new          (승인 가능)
 *
 * 사람이 이미 승인/반려한 항목은 건드리지 않는다.
 * "중복 아님"으로 되돌린 항목은 중복 플래그를 상태 계산에서 제외해
 * 정상 검수 흐름으로 복귀시킨다.
 */
export function decideStatus(item: Item): ReviewStatus {
  if (item.review_status === 'approved' || item.review_status === 'rejected') {
    return item.review_status;
  }

  const active = effectiveFlags(item);
  if (active.includes('missing_required')) return 'needs_review';
  if (active.length > 0) return 'on_hold';
  return 'new';
}

/** duplicate_dismissed가 켜지면 중복 플래그는 상태 계산에서 빠진다. */
export function effectiveFlags(item: Item) {
  return item.duplicate_dismissed
    ? item.exception_flags.filter((f) => f !== 'duplicate_suspected')
    : item.exception_flags;
}

/**
 * 승인 가능 여부.
 * 필수값이 비어 있으면 채우기 전까지 승인할 수 없다(요건 명시).
 */
export function canApprove(item: Item): boolean {
  return !effectiveFlags(item).includes('missing_required');
}
