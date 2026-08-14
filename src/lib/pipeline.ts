import {
  COLUMN_TO_FIELD,
  REQUIRED_COLUMNS,
  type Item,
  type ItemFields,
  type ReviewStatus,
} from './types';
import { normalizeItemName } from './normalize';
import { detectRowExceptions, detectDuplicates } from './detect';
import { validateFormats } from './validateFormat';
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
  /** 어떻게 들어왔는지. 화면에서 직접 등록하면 파일명과 행 번호가 없다 */
  inputMethod?: 'file' | 'manual';
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
  fileName: string | null,
  existing: Item[] = [],
  ctx: IntakeContext = { batchNo: 1, startSeq: 0 },
): Item[] {
  const incoming = rows.map((row, i) =>
    buildItem(row, fileName, ctx.batchNo, ctx.startSeq + i + 1, ctx.inputMethod ?? 'file'),
  );
  const items = [...existing, ...incoming];

  detectDuplicates(items);
  for (const item of items) {
    item.review_status = decideStatus(item);
  }

  return items;
}

/**
 * 화면에서 직접 등록한 항목 하나를 목록에 더한다.
 *
 * 파일 인입과 **같은 경로**를 탄다. 정규화 후보 생성, 예외 4종 탐지, 형식 검증,
 * 중복 판정, 상태 결정이 모두 그대로 적용된다. 수기 등록만 별도 경로로 두면
 * "직접 넣은 건 중복 검사가 안 된다" 같은 구멍이 생긴다. 공급사가 전화로 통보한
 * 인상분을 담당자가 넣는 상황이 이 기능의 용도라, 파일로 들어온 항목과 나란히
 * 비교되어야 중복 판정이 의미를 갖는다.
 */
export function addManualItem(
  values: Record<string, string>,
  existing: Item[] = [],
  batchNo = 1,
): Item[] {
  return addManualItems([values], existing, batchNo);
}

/**
 * 여러 건을 한 번에 더한다. PDF에서 읽은 표는 행이 여럿이다.
 * 한 건씩 넣으면 인입 배치가 쪼개져 중복 사유 문구가 어긋난다.
 */
export function addManualItems(
  rows: Record<string, string>[],
  existing: Item[] = [],
  batchNo = 1,
): Item[] {
  // 화면에서 만든 항목은 파일의 행이 아니므로 rowNo와 원문은 쓰이지 않는다.
  const parsed: ParsedRow[] = rows.map((values) => ({ rowNo: 0, values, raw: '' }));
  return buildItems(parsed, null, existing, {
    batchNo,
    startSeq: existing.length,
    inputMethod: 'manual',
  });
}

function buildItem(
  row: ParsedRow,
  fileName: string | null,
  batchNo: number,
  intakeSeq: number,
  inputMethod: 'file' | 'manual',
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
      input_method: inputMethod,
      // 수기 등록은 파일의 한 행이 아니므로 파일명과 행 번호를 남기지 않는다.
      // 이 값이 비어 있는 것 자체가 "사람이 직접 넣었다"는 근거가 된다.
      file_name: inputMethod === 'manual' ? null : fileName,
      row_no: inputMethod === 'manual' ? null : row.rowNo,
      batch_no: batchNo,
      raw_line: inputMethod === 'manual' ? '' : row.raw,
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
    format_errors: [],
    review_status: 'new',
    review_memo: '',
    reviewed_at: null,
    change_log: [],
  };

  const outcome = detectRowExceptions(item);
  item.exception_flags = outcome.flags;
  item.exception_reasons = outcome.reasons;
  item.spec_change = outcome.specChange;
  // 형식 검증은 열 매핑이 끝난 뒤 각 행에 적용한다(회신 2절, 체크리스트 4번)
  item.format_errors = validateFormats(item.current);

  return item;
}

/**
 * 저장해 둔 항목을 복원할 때 빠진 필드를 채운다.
 *
 * 나중에 추가한 필드는 예전 백업에 없다. 표시 전용 필드 하나 때문에 검수하던
 * 승인과 메모를 통째로 버릴 이유가 없으므로, 판정에 영향이 없는 값은 기본값으로 메운다.
 * 상태 계산에 쓰이는 필드가 늘어나면 그때는 저장 키의 버전을 올려야 한다.
 */
export function restoreItems(items: Item[]): Item[] {
  return items.map((item) => ({
    ...item,
    source_ref: { ...item.source_ref, raw_line: item.source_ref.raw_line ?? '' },
  }));
}

/**
 * 사람이 값을 고친 뒤 예외와 상태를 다시 계산한다.
 *
 * 값이 바뀌면 판정도 바뀐다. 비어 있던 적용일을 채우면 필수값 누락이 풀리고,
 * 정규화 품목명을 고치면 중복 그룹이 달라진다. 중복은 목록 전체를 봐야 하므로
 * 한 항목만 다시 계산할 수 없고 매번 전체를 다시 돌린다.
 *
 * 사람이 남긴 것(review_status, 메모, 변경 이력, 중복 아님 표시)은 보존한다.
 *
 * at을 주면 승인이 자동으로 풀린 경우 그 사실을 변경 이력에 남긴다.
 * 시각을 만들 수 없는 호출부(테스트 등)는 생략할 수 있다.
 */
export function recomputeItems(items: Item[], at?: string): Item[] {
  const next: Item[] = items.map((item) => {
    const outcome = detectRowExceptions(item);
    return {
      ...item,
      exception_flags: outcome.flags,
      exception_reasons: outcome.reasons,
      spec_change: outcome.specChange,
      format_errors: validateFormats(item.current),
      duplicate_of: null,
      duplicate_of_doc_id: null,
      duplicate_members: [],
    };
  });

  detectDuplicates(next);
  for (const item of next) {
    const status = decideStatus(item);

    // 승인이 풀렸으면 이력에 남긴다. 상태만 조용히 바뀌면 담당자가 알 수 없다.
    if (item.review_status === 'approved' && status !== 'approved') {
      item.reviewed_at = null;
      if (at) {
        item.change_log = [
          ...item.change_log,
          { at, field: 'review_status', from: 'approved', to: status, action: 'unapprove' },
        ];
      }
    }

    item.review_status = status;
  }
  return next;
}

/**
 * 상태 결정 규칙.
 *
 *   형식 오류 있음 또는 missing_required 있음   -> needs_review (확인 필요)
 *   없고 spec/unit/duplicate 중 하나라도 있음   -> on_hold      (보류 필요)
 *   아무 문제 없음                              -> new          (승인 가능)
 *
 * 형식 오류를 needs_review로 보내는 것은 회신 2절이 지정한 상태다.
 * 사람이 이미 승인/반려한 항목은 건드리지 않는다.
 * "중복 아님"으로 되돌린 항목은 중복 플래그를 상태 계산에서 제외해
 * 정상 검수 흐름으로 복귀시킨다.
 */
export function decideStatus(item: Item): ReviewStatus {
  // 승인한 뒤에 값이나 근거가 바뀌어 승인 조건을 잃으면 승인을 유지할 수 없다.
  // 그 승인은 바뀌기 전 상태에 대한 판단이었고, 지금은 내보낼 수 없다.
  // 사람 몰래 풀리지 않도록 recomputeItems가 이력에 남긴다.
  const approvalLost = item.review_status === 'approved' && !canApprove(item);

  if (!approvalLost && (item.review_status === 'approved' || item.review_status === 'rejected')) {
    return item.review_status;
  }

  // 승인이 풀린 항목도 아래 규칙을 그대로 태운다.
  // 무조건 needs_review로 보내면, 규격 불일치를 수용했다가 근거를 지운 항목이
  // "필수값·형식이 잘못됨"을 뜻하는 상태로 잘못 표시된다.
  if (item.format_errors.length > 0) return 'needs_review';

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
 * 승인 가능 여부. 막는 경우는 세 가지다.
 *
 * 1. 필수값이 비어 있음 — 채우기 전까지 승인 불가(요건 명시)
 * 2. 값을 정수·날짜로 읽지 못함 — 명세가 형식 오류의 승인 차단까지 지정하지는
 *    않았지만, 단가를 읽지 못한 채 승인하면 내보내기에서 숫자 필드를 채울 수 없어
 *    앞단 설계가 받을 수 없는 출력이 나간다. 빈 값과 해석 불가 값은 "쓸 수 없는
 *    값"이라는 점에서 같아서 같은 취급을 한다.
 * 3. 예외가 남은 채 승인하려는데 판단 근거가 없음 — 공지 §1이
 *    "아무 검토 없이 예외 상태를 승인하는 흐름은 허용하지 않습니다",
 *    "현재 값을 그대로 수용해 승인하면 exception_flags와 승인 사유를 함께
 *    보존합니다"라고 명시했다. 사유를 보존하려면 사유가 있어야 한다.
 *
 * 3번은 예외를 **수용**할 때만 해당한다. 값을 고치거나 "중복 아님"으로
 * 되돌려 예외를 **해소**했다면 남은 플래그가 없으므로 메모 없이 승인할 수 있다.
 */
export function canApprove(item: Item): boolean {
  return approvalBlock(item) === null;
}

export interface ApprovalBlock {
  /** 항목 머리말 배지용 짧은 문구 */
  short: string;
  /** 검수 버튼 아래 안내용. 무엇을 하면 열리는지까지 적는다 */
  detail: string;
}

/**
 * 승인이 막힌 이유. 화면 두 곳이 같은 문구를 쓰도록 여기서 하나로 관리한다.
 * 막히지 않았으면 null.
 */
export function approvalBlock(item: Item): ApprovalBlock | null {
  if (item.format_errors.length > 0) {
    return {
      short: '형식을 고치기 전까지 승인할 수 없습니다',
      detail: `정수·날짜로 읽지 못한 값이 ${item.format_errors.length}건 있습니다. 위 사유를 보고 값을 고치면 승인할 수 있습니다.`,
    };
  }

  const flags = effectiveFlags(item);
  if (flags.includes('missing_required')) {
    return {
      short: '필수값을 채우기 전까지 승인할 수 없습니다',
      detail: '필수값 누락 상태입니다. 비어 있는 값을 채우면 승인할 수 있습니다.',
    };
  }
  if (flags.length > 0 && item.review_memo.trim() === '') {
    return {
      short: '판단 근거를 적어야 승인할 수 있습니다',
      detail:
        '예외가 남은 채로 승인하려면 검수 메모에 판단 근거를 적어야 합니다. 값을 고치거나 중복 아님으로 되돌려 예외를 해소한 경우에는 필요 없습니다.',
    };
  }
  return null;
}
