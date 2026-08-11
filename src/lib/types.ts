/**
 * 구매 증빙 검수 인박스 - 도메인 타입
 *
 * 설계 원칙: observed(파싱 원본)는 절대 변경하지 않고,
 * 사람이 고치는 값은 current에 따로 둔다.
 * 요건 "관찰값/수정값 분리", "원래 값과 수정값 비교"가 이 구조로 충족된다.
 */

/** 입력 CSV의 9개 컬럼. 전부 필수값이다. */
export const REQUIRED_COLUMNS = [
  '문서ID',
  '원본유형',
  '공급사',
  '원문 품목명',
  '규격',
  '단위',
  '기존단가(원)',
  '변경단가(원)',
  '적용일',
] as const;

/** 한글 컬럼명 -> 내부 영문 field ID */
export const COLUMN_TO_FIELD = {
  '문서ID': 'doc_id',
  '원본유형': 'source_type',
  '공급사': 'supplier_name',
  '원문 품목명': 'raw_item_name',
  '규격': 'spec',
  '단위': 'unit',
  '기존단가(원)': 'price_before',
  '변경단가(원)': 'price_after',
  '적용일': 'effective_date',
} as const;

/**
 * 관찰/수정 대상 필드.
 * 값은 전부 문자열로 보관한다. 원본 표기를 그대로 남겨야 근거 표시가 되고,
 * 숫자 변환은 내보내기 시점에 하면서 실패를 유효성 오류로 드러낼 수 있다.
 */
export interface ItemFields {
  source_type: string;
  supplier_name: string;
  raw_item_name: string;
  spec: string;
  unit: string;
  price_before: string;
  price_after: string;
  effective_date: string;
}

/** current에만 있는 산출 필드까지 포함한 형태 */
export interface CurrentFields extends ItemFields {
  normalized_item_name: string;
}

export type ReviewStatus =
  | 'new'
  | 'needs_review'
  | 'on_hold'
  | 'approved'
  | 'rejected';

export type ExceptionFlag =
  | 'missing_required'
  | 'spec_mismatch'
  | 'unit_mismatch'
  | 'duplicate_suspected';

/** 정규화 후보를 어디서 얻었는지. insufficient면 화면에 "데이터 부족"으로 표시한다. */
export type NormalizationSource = 'dictionary' | 'rule' | 'insufficient';

export interface SourceRef {
  input_method: 'file' | 'manual';
  /** 수기 입력이면 null */
  file_name: string | null;
  /** 헤더를 1행으로 세는 1-indexed 행 번호. 수기 입력이면 null */
  row_no: number | null;
  /** 몇 번째 인입인지. 같은 파일을 다시 올리면 2가 된다. 1부터 */
  batch_no: number;
}

export interface ChangeLogEntry {
  at: string;
  field: string;
  from: string;
  to: string;
  action: 'edit' | 'approve' | 'reject' | 'reopen' | 'dismiss_duplicate';
}

export interface Item {
  /**
   * 시스템 내부 식별자.
   *
   * 문서ID는 같은 파일을 다시 올리면 중복되므로 유일 키로 쓸 수 없다.
   * 문서ID를 키로 강제하면 재업로드에서 저장이 실패한다.
   */
  uid: string;
  /** 시스템 인입 순번. 중복 그룹에서 어느 쪽이 기준 항목인지 정하는 기준이다. */
  intake_seq: number;

  doc_id: string;
  source_ref: SourceRef;

  /** 파싱 결과 원본. 읽기 전용으로 취급한다. */
  observed: ItemFields;
  /** 사람이 수정할 수 있는 현재값 */
  current: CurrentFields;

  normalization: {
    source: NormalizationSource;
    candidate: string;
  };

  /** 규격이 "기존 A / 변경 B" 형태일 때 캡처한 값 */
  spec_change: { old: string; new: string } | null;

  /** 중복 그룹 기준 항목의 uid. 기준 항목 자신은 null */
  duplicate_of: string | null;
  /** 기준 항목의 문서ID. 화면 표시용 */
  duplicate_of_doc_id: string | null;
  /** 같은 그룹의 후속 항목들(기준 항목에만 채움). 이동 링크용 */
  duplicate_members: { uid: string; doc_id: string }[];
  /** 사람이 "중복 아님"으로 되돌렸는지 */
  duplicate_dismissed: boolean;

  exception_flags: ExceptionFlag[];
  /** 플래그별 사람이 읽을 탐지 사유 */
  exception_reasons: Partial<Record<ExceptionFlag, string>>;

  review_status: ReviewStatus;
  review_memo: string;
  reviewed_at: string | null;
  change_log: ChangeLogEntry[];
}

/** 표준 단위 집합. 이 밖이면 단위 불일치로 본다. */
export const STANDARD_UNITS = ['PK', 'BOX', 'EA', 'PO'] as const;

/** 중복 판정에 쓰는 7개 필드 */
export const DUPLICATE_KEY_FIELDS = [
  'supplier_name',
  'normalized_item_name',
  'spec',
  'unit',
  'price_before',
  'price_after',
  'effective_date',
] as const;
