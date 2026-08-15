import type { Item } from './types';

/**
 * 규격이 줄었을 때의 실질 단가.
 *
 * 창업팀 규칙 명세 4-3이 DOC-019를 이렇게 설명한다.
 *
 * > 단가는 86,000원 → 86,000원으로 그대로인데 규격이 10kg → 9kg으로 줄었습니다.
 * > kg당 단가로는 약 11% 실질 인상입니다. 가격이 안 올랐다고 자동 승인되면 인상을 놓칩니다.
 *
 * 그 계산을 사람이 머리로 하지 않게 화면에서 대신 해 준다.
 *
 * 세 가지를 지킨다.
 *
 * 1. **산출값이고 판정이 아니다.** 예외 4종(`exception_flags`)에 손대지 않는다.
 *    공지가 "예외 4종 탐지 규칙과 제공 20건 정답을 변경하지 않습니다"라고 명시했고,
 *    다섯 번째 플래그를 만들면 20건 정답 대조가 흔들린다.
 * 2. **승인 조건에 쓰지 않는다.** 실질 인상률이 몇 %든 승인 여부는 사람이 정한다.
 *    자동 환산·자동 승인 금지(명세 4-3)를 어기지 않는다.
 * 3. **기준이 바뀌면 계산하지 않고 이유를 말한다.** kg에서 단으로 바뀐 DOC-020은
 *    1단이 몇 kg인지 공급사만 아는 정보라 숫자를 만들어내면 안 된다.
 */
export type RealUnitPrice =
  | {
      comparable: true;
      /** 환산 기준 단위. "kg" 같은 값 */
      unit: string;
      quantityBefore: number;
      quantityAfter: number;
      /** 단위 1개당 단가. 반올림하지 않은 값을 담고 화면에서 다듬는다 */
      pricePerUnitBefore: number;
      pricePerUnitAfter: number;
      /** 실질 변화율(%). 양수면 인상 */
      changeRate: number;
    }
  | { comparable: false; reason: string };

/**
 * 규격 변경 통보가 아닌 항목은 `null`. 화면은 카드를 아예 그리지 않는다.
 * 변경 통보인데 환산이 안 되면 `comparable: false`와 그 이유를 돌려준다.
 */
export function computeRealUnitPrice(item: Item): RealUnitPrice | null {
  const change = item.spec_change;
  if (!change) return null;

  const before = parseQuantity(change.old);
  const after = parseQuantity(change.new);

  if (!before || !after) {
    return {
      comparable: false,
      reason: '규격에서 수량과 단위를 읽지 못해 환산할 수 없습니다.',
    };
  }

  if (before.compound || after.compound) {
    return {
      comparable: false,
      reason: '여러 단위가 묶인 규격은 환산 기준을 자동으로 정하지 않습니다.',
    };
  }

  if (before.unit !== after.unit) {
    return {
      comparable: false,
      reason:
        `기준이 ${before.unit}에서 ${after.unit}(으)로 바뀌어 비교할 수 없습니다. ` +
        `1${after.unit}이 몇 ${before.unit}인지는 공급사에 확인해야 합니다.`,
    };
  }

  // 단가 형식 검증은 validateFormats가 이미 했다. 같은 규칙을 다시 쓰지 않고 결과를 게이트로 쓴다.
  const priceBroken = item.format_errors.some(
    (e) => e.field === 'price_before' || e.field === 'price_after',
  );
  if (priceBroken) {
    return {
      comparable: false,
      reason: '단가를 정수로 읽지 못해 환산할 수 없습니다. 단가를 고치면 계산됩니다.',
    };
  }

  const priceBefore = toNumber(item.current.price_before);
  const priceAfter = toNumber(item.current.price_after);
  if (priceBefore === null || priceAfter === null) {
    return {
      comparable: false,
      reason: '단가가 비어 있어 환산할 수 없습니다.',
    };
  }

  if (before.quantity === 0 || after.quantity === 0) {
    return {
      comparable: false,
      reason: '규격 수량이 0이어서 단위당 단가를 낼 수 없습니다.',
    };
  }

  const perBefore = priceBefore / before.quantity;
  const perAfter = priceAfter / after.quantity;

  if (perBefore === 0) {
    return {
      comparable: false,
      reason: '기존 단위당 단가가 0이어서 변화율을 낼 수 없습니다.',
    };
  }

  return {
    comparable: true,
    unit: before.unit,
    quantityBefore: before.quantity,
    quantityAfter: after.quantity,
    pricePerUnitBefore: perBefore,
    pricePerUnitAfter: perAfter,
    changeRate: (perAfter / perBefore - 1) * 100,
  };
}

interface Quantity {
  quantity: number;
  unit: string;
  /** "2kg×6PK"처럼 단위가 여러 개 묶인 형태인지 */
  compound: boolean;
}

/** "10kg" -> 10 / "kg", "2.5kg" -> 2.5 / "kg" */
function parseQuantity(value: string): Quantity | null {
  const matched = /^\s*([\d.,]+)\s*(.+?)\s*$/.exec(value ?? '');
  if (!matched) return null;

  const quantity = toNumber(matched[1]);
  const unit = matched[2].trim();
  if (quantity === null || unit === '') return null;

  return { quantity, unit, compound: /[×x*\/\d]/i.test(unit) };
}

/** 천단위 콤마를 떼고 숫자로 읽는다. 읽을 수 없으면 null */
function toNumber(value: string): number | null {
  const cleaned = (value ?? '').replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
