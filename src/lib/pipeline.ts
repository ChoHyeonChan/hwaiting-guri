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
export interface IntakeContext {
  /** 몇 번째 인입인지. 1부터 */
  batchNo: number;
  /** 이미 인입된 항목 수. 새 항목의 intake_seq는 여기서 이어진다 */
  startSeq: number;
}

/**
 * 파싱된 행을 검수 대상 Item으로 만들어 **기존 목록 뒤에 이어 붙인다**.
 *
 * 같은 파일을 다시 올려도 기존 항목을 덮어쓰지 않는다. 중복 판정의 비교 범위가
 * "같은 파일 안"이 아니라 "이미 인입된 전체 항목(승인 완료 포함)"이기 때문이다.
 * 재발송 공문이나 실수로 두 번 올린 파일에서 같은 인상분이 두 번 반영되는 사고를
 * 잡으려면 새 인입분이 기존 항목과 비교돼야 한다.
 */
export function buildItems(
  rows: ParsedRow[],
  fileName: string,
  existing: Item[] = [],
  ctx: IntakeContext = { batchNo: 1, startSeq: 0 },
): Item[] {
  const incoming = rows.map((row, i) =>
    buildItem(row, fileName, ctx.batchNo, ctx.startSeq + i + 1),
  );
  const items = [...existing, ...incoming];

  detectDuplicates(items);
  for (const item of items) {
    item.review_status = decideStatus(item);
  }

  return items;
}

function buildItem(
  row: ParsedRow,
  fileName: string,
  batchNo: number,
  intakeSeq: number,
): Item {
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
    uid: `${intakeSeq}:${docId}`,
    intake_seq: intakeSeq,
    doc_id: docId,
    source_ref: {
      input_method: 'file',
      file_name: fileName,
      row_no: row.rowNo,
      batch_no: batchNo,
    },
    observed,
    current: { ...observed, normalized_item_name: normalization.candidate },
    normalization,
    spec_change: null,
    duplicate_of: null,
    duplicate_of_doc_id: null,
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
 * 사람이 값을 고친 뒤 예외와 상태를 다시 계산한다.
 *
 * 값이 바뀌면 판정도 바뀐다. 비어 있던 적용일을 채우면 필수값 누락이 풀리고,
 * 정규화 품목명을 고치면 중복 그룹이 달라진다. 중복은 목록 전체를 봐야 하므로
 * 한 항목만 다시 계산할 수 없고 매번 전체를 다시 돌린다.
 *
 * 사람이 남긴 것(review_status, 메모, 변경 이력, 중복 아님 표시)은 보존한다.
 */
export function recomputeItems(items: Item[]): Item[] {
  const next: Item[] = items.map((item) => {
    const outcome = detectRowExceptions(item);
    return {
      ...item,
      exception_flags: outcome.flags,
      exception_reasons: outcome.reasons,
      spec_change: outcome.specChange,
      duplicate_of: null,
      duplicate_of_doc_id: null,
      duplicate_members: [],
    };
  });

  detectDuplicates(next);
  for (const item of next) item.review_status = decideStatus(item);
  return next;
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
