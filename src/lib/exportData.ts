import { canApprove } from './pipeline';
import type { Item } from './types';

/**
 * 승인 항목을 ComfoziAI 앞단이 받을 형태로 바꾼다.
 *
 * 명세 §7 권장안을 그대로 따르되 format_errors를 덧붙였다.
 * 승인 전·보류·반려는 제외한다(명세 §7, 공지 §1).
 *
 * 화면 상태를 건드리지 않는 순수 함수만 둔다. 파일로 만드는 일은 화면 쪽에서 한다.
 */

/** 단가는 문자열로 보관하다가 내보낼 때 정수로 바꾼다. 읽지 못하면 null로 두고 유효성 오류로 알린다. */
export interface ExportRow {
  /**
   * 행을 유일하게 식별하는 값. 명세 권장안에는 없지만 덧붙였다.
   *
   * 문서ID는 같은 공문이 재발송되거나 파일을 두 번 올리면 중복된다. 회신(2026-08-11)도
   * "문서ID를 유일 키로 강제하면 재업로드에서 저장이 실패한다"고 짚었다. 내부에서는 uid로
   * 해결했는데 출력에 담지 않으면 받는 쪽이 같은 문제를 다시 겪는다.
   */
  uid: string;
  doc_id: string;
  source_type: string;
  supplier_name: string;
  raw_item_name: string;
  normalized_item_name: string;
  spec: string;
  unit: string;
  price_before: number | null;
  price_after: number | null;
  effective_date: string;
  review_status: string;
  exception_flags: string[];
  format_errors: { field: string; value: string; reason: string }[];
  source_ref: {
    input_method: string;
    file_name: string | null;
    row_no: number | null;
  };
  reviewed_at: string | null;
  review_memo: string;
  change_log: { at: string; field: string; from: string; to: string; action: string }[];
}

/** 내보내기 직전에 발견한 문제. 요건 ⑦ 세부설명의 "출력 유효성 오류 표시"에 해당한다. */
export interface ExportIssue {
  uid: string;
  doc_id: string;
  field: string;
  reason: string;
}

export interface ExportResult {
  rows: ExportRow[];
  issues: ExportIssue[];
  /** 승인 상태지만 승인 조건을 잃은 항목. 정상 흐름에서는 나오지 않아야 한다 */
  excluded: { doc_id: string; reason: string }[];
}

/** 천단위 콤마를 뗀 뒤 정수로 읽는다. 실패하면 null. */
function toInteger(value: string): number | null {
  const digits = (value ?? '').replace(/,/g, '').trim();
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/**
 * 승인 항목만 골라 출력 행과 유효성 오류를 함께 만든다.
 *
 * 유효성 검사를 내보내기 시점에 한 번 더 도는 이유는, 승인 이후에도 값이 바뀔 수 있고
 * 앞단이 받을 수 없는 데이터가 조용히 나가면 안 되기 때문이다.
 * 오류가 있어도 내보내기를 막지는 않는다. 명세는 "표시"를 요구한다.
 */
export function buildExport(items: Item[]): ExportResult {
  const rows: ExportRow[] = [];
  const issues: ExportIssue[] = [];
  const excluded: { doc_id: string; reason: string }[] = [];

  for (const item of items) {
    if (item.review_status !== 'approved') continue;

    // 승인 상태인데 승인 조건을 잃은 항목은 내보내지 않는다.
    // recomputeItems가 승인을 풀어 주므로 정상 흐름에서는 비어 있어야 한다.
    if (!canApprove(item)) {
      excluded.push({ doc_id: item.doc_id, reason: '승인 조건을 잃은 항목입니다' });
      continue;
    }

    const priceBefore = toInteger(item.current.price_before);
    const priceAfter = toInteger(item.current.price_after);

    if (priceBefore === null) {
      issues.push({
        uid: item.uid, doc_id: item.doc_id, field: 'price_before',
        reason: `기존단가를 정수로 내보낼 수 없습니다(값 "${item.current.price_before}").`,
      });
    }
    if (priceAfter === null) {
      issues.push({
        uid: item.uid, doc_id: item.doc_id, field: 'price_after',
        reason: `변경단가를 정수로 내보낼 수 없습니다(값 "${item.current.price_after}").`,
      });
    }
    // 정규화 품목명은 예외 4종에 걸리지 않아 비어 있어도 승인될 수 있다.
    // 앞단이 품목을 식별하지 못하므로 내보내기 시점에 알린다.
    if (item.current.normalized_item_name.trim() === '') {
      issues.push({
        uid: item.uid, doc_id: item.doc_id, field: 'normalized_item_name',
        reason: '정규화 품목명이 비어 있습니다. 앞단에서 품목을 식별할 수 없습니다.',
      });
    }

    rows.push({
      uid: item.uid,
      doc_id: item.doc_id,
      source_type: item.current.source_type,
      supplier_name: item.current.supplier_name,
      raw_item_name: item.current.raw_item_name,
      normalized_item_name: item.current.normalized_item_name,
      spec: item.current.spec,
      unit: item.current.unit,
      price_before: priceBefore,
      price_after: priceAfter,
      effective_date: item.current.effective_date,
      review_status: item.review_status,
      // 예외를 수용해 승인한 경우 플래그를 지우지 않는다(공지 §1).
      exception_flags: [...item.exception_flags],
      format_errors: item.format_errors.map((e) => ({ ...e })),
      source_ref: {
        input_method: item.source_ref.input_method,
        file_name: item.source_ref.file_name,
        row_no: item.source_ref.row_no,
      },
      reviewed_at: item.reviewed_at,
      review_memo: item.review_memo,
      change_log: item.change_log.map((c) => ({ ...c })),
    });
  }

  // 같은 문서ID가 두 건 이상 나가면 알린다.
  // 재발송 공문을 둘 다 수용 승인한 경우인데, 같은 단가 인상이 두 번 반영되는 사고가
  // 이 도구가 막으려는 상황이라 출력 직전에 한 번 더 확인받는다.
  const seen = new Map<string, ExportRow[]>();
  for (const row of rows) {
    const group = seen.get(row.doc_id);
    if (group) group.push(row);
    else seen.set(row.doc_id, [row]);
  }
  for (const [docId, group] of seen) {
    if (group.length < 2) continue;
    issues.push({
      uid: group[0].uid,
      doc_id: docId,
      field: 'doc_id',
      reason: `같은 문서ID가 ${group.length}건 승인되어 함께 나갑니다. 같은 인상분이 두 번 반영되지 않는지 확인이 필요합니다.`,
    });
  }

  return { rows, issues, excluded };
}

export function toJson(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

/** CSV 열 순서. JSON을 평탄화한 것이며 README 필드표와 같은 순서다. */
export const CSV_COLUMNS = [
  'uid', 'doc_id', 'source_type', 'supplier_name', 'raw_item_name', 'normalized_item_name',
  'spec', 'unit', 'price_before', 'price_after', 'effective_date',
  'review_status', 'exception_flags', 'reviewed_at', 'review_memo',
  'source_input_method', 'source_file_name', 'source_row_no',
  'change_log_count', 'change_log_json',
] as const;

/** RFC 4180. 구분자·따옴표·줄바꿈이 있으면 감싸고 내부 따옴표는 두 번 쓴다. */
function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV 평탄화.
 *
 * - 중첩된 source_ref는 source_ 접두사를 붙여 편다(명세 §7 예시).
 * - exception_flags는 세미콜론으로 잇는다. 쉼표를 쓰면 열 구분자와 겹쳐 읽기 어려워진다.
 * - change_log는 배열이라 열 하나로 펼 수 없어 건수와 JSON 문자열 두 열로 남긴다.
 *   건수만 두면 CSV만 받는 쪽이 이력을 잃는다.
 * - 앞에 BOM을 붙인다. 없으면 엑셀이 UTF-8을 읽지 못해 한글이 깨진다.
 */
export function toCsv(rows: ExportRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];

  for (const row of rows) {
    const flat: Record<string, string> = {
      uid: row.uid,
      doc_id: row.doc_id,
      source_type: row.source_type,
      supplier_name: row.supplier_name,
      raw_item_name: row.raw_item_name,
      normalized_item_name: row.normalized_item_name,
      spec: row.spec,
      unit: row.unit,
      price_before: row.price_before === null ? '' : String(row.price_before),
      price_after: row.price_after === null ? '' : String(row.price_after),
      effective_date: row.effective_date,
      review_status: row.review_status,
      exception_flags: row.exception_flags.join(';'),
      reviewed_at: row.reviewed_at ?? '',
      review_memo: row.review_memo,
      source_input_method: row.source_ref.input_method,
      source_file_name: row.source_ref.file_name ?? '',
      source_row_no: row.source_ref.row_no === null ? '' : String(row.source_ref.row_no),
      change_log_count: String(row.change_log.length),
      change_log_json: row.change_log.length === 0 ? '' : JSON.stringify(row.change_log),
    };
    lines.push(CSV_COLUMNS.map((c) => escapeCsv(flat[c] ?? '')).join(','));
  }

  return `﻿${lines.join('\r\n')}\r\n`;
}
