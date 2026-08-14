import { FIELD_LABEL } from './labels';
import type { CurrentFields, FormatError } from './types';

/**
 * 값의 형식 검증.
 *
 * 창업팀 회신 2절: "값은 있으나 정수·날짜 등 형식 해석에 실패하면 프로그램을
 * 중단하지 말고 `확인 필요`와 실패 이유를 표시합니다."
 *
 * 그래서 여기서는 예외를 던지지 않는다. 실패는 전부 값으로 돌려주고,
 * 화면이 사유를 보여주면 담당자가 고친다.
 *
 * 자동 보정도 하지 않는다. "32.000"이 3만 2천인지 32인지는 값만 봐서 알 수 없고,
 * 단가를 잘못 읽으면 계약 금액이 틀어진다. 판단은 사람에게 넘긴다.
 */
export function validateFormats(fields: CurrentFields): FormatError[] {
  const errors: FormatError[] = [];

  for (const field of ['price_before', 'price_after'] as const) {
    const value = (fields[field] ?? '').trim();
    // 공란은 필수값 누락이 이미 잡았다. 같은 문제를 두 번 표시하지 않는다.
    if (value === '') continue;

    const reason = priceFailure(field, value);
    if (reason) errors.push({ field, value, reason });
  }

  const date = (fields.effective_date ?? '').trim();
  if (date !== '') {
    const reason = dateFailure(date);
    if (reason) errors.push({ field: 'effective_date', value: date, reason });
  }

  return errors;
}

/** 천단위 콤마를 뗀 뒤 숫자만 남아야 한다. 원 단위 단가라 소수점과 음수는 받지 않는다. */
const INTEGER_PATTERN = /^\d+$/;

function priceFailure(field: 'price_before' | 'price_after', value: string): string | null {
  const digits = value.replace(/,/g, '');
  if (INTEGER_PATTERN.test(digits)) return null;

  const label = FIELD_LABEL[field];
  return `${label} 값 "${value}"을(를) 정수로 읽을 수 없습니다. 원 단위 숫자만 있어야 합니다(예: 15000).`;
}

/** 출력 스키마에서 날짜 표기를 하나로 통일하기 위해 YYYY-MM-DD만 받는다. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateFailure(value: string): string | null {
  const label = FIELD_LABEL.effective_date;
  const matched = DATE_PATTERN.exec(value);
  if (!matched) {
    return `${label} 값 "${value}"을(를) 날짜로 읽을 수 없습니다. YYYY-MM-DD 형태여야 합니다(예: 2026-08-01).`;
  }

  // 형식이 맞아도 달력에 없는 날일 수 있다(2026-02-30).
  // 파싱 결과를 원래 숫자와 다시 대조해야 잡힌다.
  const [, year, month, day] = matched;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const real =
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day);

  if (!real) {
    return `${label} 값 "${value}"은(는) 달력에 없는 날짜입니다. 실제 날짜인지 확인이 필요합니다.`;
  }
  return null;
}
