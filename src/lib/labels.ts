import type { ExceptionFlag, Item, ReviewStatus, SourceRef } from './types';

/** 화면에 쓰는 한글 라벨. 내부 값은 영문 field ID를 그대로 쓴다. */
export const STATUS_LABEL: Record<ReviewStatus, string> = {
  new: '승인 가능',
  needs_review: '확인 필요',
  on_hold: '보류 필요',
  approved: '승인',
  rejected: '반려',
};

export const STATUS_ORDER: ReviewStatus[] = [
  'new',
  'needs_review',
  'on_hold',
  'approved',
  'rejected',
];

/** 명세 6-1 규칙 순서와 같다. 배지 노출 순서도 이 순서를 따른다. */
export const FLAG_LABEL: Record<ExceptionFlag, string> = {
  missing_required: '필수값 누락',
  spec_mismatch: '규격 불일치',
  unit_mismatch: '단위 불일치',
  duplicate_suspected: '중복 의심',
};

export const FLAG_ORDER: ExceptionFlag[] = [
  'missing_required',
  'spec_mismatch',
  'unit_mismatch',
  'duplicate_suspected',
];

export const STATUS_STYLE: Record<ReviewStatus, string> = {
  new: 'bg-slate-100 text-slate-700 border-slate-300',
  needs_review: 'bg-amber-50 text-amber-800 border-amber-300',
  on_hold: 'bg-orange-50 text-orange-800 border-orange-300',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  rejected: 'bg-rose-50 text-rose-800 border-rose-300',
};

export const FLAG_STYLE: Record<ExceptionFlag, string> = {
  missing_required: 'bg-amber-100 text-amber-900 border-amber-300',
  spec_mismatch: 'bg-sky-100 text-sky-900 border-sky-300',
  unit_mismatch: 'bg-violet-100 text-violet-900 border-violet-300',
  duplicate_suspected: 'bg-pink-100 text-pink-900 border-pink-300',
};

/**
 * 형식 오류는 예외 4종이 아니라 별도 축이라 배지 색도 4종과 구분한다.
 * 4종 중 하나로 보이면 "5번째 예외가 생겼다"고 오해할 수 있다.
 */
export const FORMAT_ERROR_LABEL = '형식 오류';
export const FORMAT_ERROR_STYLE = 'bg-red-100 text-red-900 border-red-300';

/**
 * 플래그가 어느 원본 값에서 나왔는지.
 * 창업팀 회신 5-2: "각 사유 옆에 근거가 된 원본 값을 함께 표시해 주세요."
 */
export function flagEvidence(item: Item, flag: ExceptionFlag): { label: string; value: string } {
  switch (flag) {
    case 'spec_mismatch':
      return { label: '규격', value: item.observed.spec };
    case 'unit_mismatch':
      return { label: '단위', value: item.observed.unit };
    case 'duplicate_suspected':
      return { label: '기준 항목', value: item.duplicate_of ?? '' };
    case 'missing_required':
      return { label: '필수 필드', value: '공란' };
  }
}

/** 목록 표시용. 회신 5-2에 따라 배지를 전부 노출하되, 좁은 폭에서는 +N으로 줄인다. */
export function summarizeFlags(flags: ExceptionFlag[], max = 2): string {
  if (flags.length === 0) return '';
  const shown = flags.slice(0, max).map((f) => FLAG_LABEL[f]);
  const rest = flags.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
}

/**
 * 목록의 문서ID 옆에 붙는 출처 배지.
 *
 * 어디서 온 값인지 한눈에 구분되어야 한다. 파일이면 몇 행인지가 가장 쓸모 있고,
 * PDF와 수기는 행 번호가 없으므로 경로 자체를 보여준다.
 */
export function sourceBadge(ref: SourceRef): string {
  if (ref.input_method === 'file') return `${ref.row_no}행`;
  if (ref.input_method === 'pdf') return ref.page_no ? `PDF ${ref.page_no}쪽` : 'PDF';
  return '수기';
}

/** 필드 한글명. 상세 화면의 관찰값/수정값 표에 쓴다. */
export const FIELD_LABEL: Record<string, string> = {
  source_type: '원본유형',
  supplier_name: '공급사',
  raw_item_name: '원문 품목명',
  normalized_item_name: '정규화 품목명',
  spec: '규격',
  unit: '단위',
  price_before: '기존단가(원)',
  price_after: '변경단가(원)',
  effective_date: '적용일',
};

export const NORMALIZATION_SOURCE_LABEL = {
  dictionary: '사전',
  rule: '규칙',
  insufficient: '데이터 부족',
} as const;
