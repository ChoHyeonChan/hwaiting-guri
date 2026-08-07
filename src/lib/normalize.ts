import {
  ITEM_NAME_DICTIONARY,
  ABBREVIATION_RULES,
  SIZE_SUFFIX_PATTERN,
} from './dictionary';
import type { NormalizationSource } from './types';

export interface NormalizationResult {
  source: NormalizationSource;
  candidate: string;
}

/**
 * 정규화 품목명 후보 생성. 사전 -> 규칙 -> 데이터 부족 3단.
 *
 * 창업팀 안내상 자동 정규화의 정확도는 평가 대상이 아니다.
 * 후보를 만들어 보여주고, 틀리면 사람이 고칠 수 있고,
 * 못 만들면 빈칸이 아니라 "데이터 부족"으로 표시하면 요건 충족이다.
 */
export function normalizeItemName(rawItemName: string): NormalizationResult {
  const raw = rawItemName.trim();

  if (raw === '') {
    return { source: 'insufficient', candidate: '' };
  }

  const fromDictionary = ITEM_NAME_DICTIONARY[raw];
  if (fromDictionary) {
    return { source: 'dictionary', candidate: fromDictionary };
  }

  const byRule = applyRules(raw);
  if (byRule === '') {
    return { source: 'insufficient', candidate: '' };
  }
  return { source: 'rule', candidate: byRule };
}

/** 약어 전개 -> 수량 꼬리 제거 -> 공백 정리 */
function applyRules(raw: string): string {
  let name = raw;

  for (const { from, to } of ABBREVIATION_RULES) {
    name = name.replace(from, to);
  }

  name = name.replace(SIZE_SUFFIX_PATTERN, '');
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

/** 화면 표시용. 후보를 못 만들었으면 빈칸 대신 이 문구를 쓴다. */
export const INSUFFICIENT_LABEL = '데이터 부족';

export function displayNormalizedName(result: NormalizationResult): string {
  return result.source === 'insufficient' ? INSUFFICIENT_LABEL : result.candidate;
}
