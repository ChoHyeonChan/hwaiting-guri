/**
 * 20건 자체 테스트 - 창업팀 기대 결과(명세 6-2)와 대조한다.
 *
 * 통과 기준 2번("4가지 문제가 문서 번호별 정답을 미리 넣지 않아도 표시된다")을
 * 증명하기 위해 두 가지를 검사한다.
 *
 *   1. 원본 20건에서 기대 결과가 그대로 나오는가
 *   2. 문서ID를 전부 바꾸고 행 순서를 섞어도 같은 판정이 나오는가
 *      (판정이 문서ID가 아니라 데이터에서 나온다는 증거)
 *
 * 실행: npx tsx scripts/verify-20.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEvidenceCsv, type ParsedRow } from '../src/lib/parseCsv';
import { buildItems } from '../src/lib/pipeline';
import type { ExceptionFlag, ReviewStatus } from '../src/lib/types';

const CSV_PATH = resolve(
  import.meta.dirname,
  '../../42_해커톤_업로드용_증빙20건_2026-08-04.csv',
);

interface Expectation {
  flags: ExceptionFlag[];
  status: ReviewStatus;
  note: string;
}

/** 명세 6-2 기대 결과 */
const EXPECTED: Record<string, Expectation> = {
  'DOC-016': { flags: ['missing_required'], status: 'needs_review', note: '적용일 공란' },
  'DOC-018': { flags: ['duplicate_suspected'], status: 'on_hold', note: 'DOC-017과 전 필드 일치' },
  'DOC-019': { flags: ['spec_mismatch'], status: 'on_hold', note: '규격 10kg -> 9kg, 단가 동결' },
  // 창업팀 회신(2026-08-06)으로 확정. 명세 6-2 표에 단위 불일치만 적힌 것이 오기였고,
  // 규격(기존 1kg / 변경 4단)과 단위(KG/단)가 각각 독립 규칙에 걸려 플래그가 2개다.
  // 20건 중 복수 해당 건은 DOC-020 하나뿐이다.
  'DOC-020': {
    flags: ['spec_mismatch', 'unit_mismatch'],
    status: 'on_hold',
    note: '규격 1kg -> 4단 + 단위 KG/단 (창업팀 정정 확정)',
  },
};

/** 위에 없는 문서는 전부 예외 없음 + 승인 가능 */
const DEFAULT_EXPECTATION: Expectation = { flags: [], status: 'new', note: '예외 없음' };

function expectationFor(docId: string): Expectation {
  return EXPECTED[docId] ?? DEFAULT_EXPECTATION;
}

const sorted = (flags: readonly string[]) => [...flags].sort().join(',') || '(없음)';

let failures = 0;

function check(label: string, actual: string, expected: string): boolean {
  const ok = actual === expected;
  if (!ok) failures += 1;
  return ok;
}

// ---------------------------------------------------------------- 1차: 원본
console.log('='.repeat(72));
console.log('1. 원본 20건 판정 결과');
console.log('='.repeat(72));

const rawText = readFileSync(CSV_PATH, 'utf8');
const parsed = parseEvidenceCsv(rawText);
console.log(`파일: ${CSV_PATH.split(/[\\/]/).pop()}`);
console.log(`행 수: ${parsed.rows.length}건, 경고: ${parsed.warnings.length}건`);
parsed.warnings.forEach((w) => console.log(`  경고: ${w}`));
console.log('');

const items = buildItems(parsed.rows, '42_해커톤_업로드용_증빙20건_2026-08-04.csv');

console.log(
  ['문서ID', '행', '탐지 플래그', '상태', '판정'].map((h, i) =>
    h.padEnd([9, 4, 34, 14, 6][i]),
  ).join(''),
);
console.log('-'.repeat(72));

for (const item of items) {
  const exp = expectationFor(item.doc_id);
  const actualFlags = sorted(item.exception_flags);
  const expectedFlags = sorted(exp.flags);
  const flagOk = check(item.doc_id, actualFlags, expectedFlags);
  const statusOk = check(item.doc_id, item.review_status, exp.status);
  const mark = flagOk && statusOk ? 'PASS' : 'FAIL';

  const isException = exp.flags.length > 0;
  if (isException || mark === 'FAIL') {
    console.log(
      item.doc_id.padEnd(9) +
        String(item.source_ref.row_no).padEnd(4) +
        actualFlags.padEnd(34) +
        item.review_status.padEnd(14) +
        mark,
    );
    if (!flagOk) console.log(`          기대 플래그: ${expectedFlags}`);
    if (!statusOk) console.log(`          기대 상태:   ${exp.status}`);
  }
}

const normalCount = items.filter((i) => i.exception_flags.length === 0).length;
const exceptionCount = items.length - normalCount;
console.log('-'.repeat(72));
console.log(`정상 ${normalCount}건 / 예외 ${exceptionCount}건  (기대: 정상 16건 / 예외 4건)`);
check('정상 건수', String(normalCount), '16');
check('예외 건수', String(exceptionCount), '4');

// --------------------------------------- 1-2차: 대기 사유 (채점 대상)
// 명세 8: "입력 근거·대기 이유·수정값·승인 이력이 명확한 것"이 중요.
// 사유가 2개인데 1개만 보이면 담당자가 확인 항목을 놓치므로 전부 노출한다.
console.log('');
console.log('='.repeat(72));
console.log('1-2. 대기 사유와 근거 원본 값');
console.log('='.repeat(72));
for (const item of items) {
  if (item.exception_flags.length === 0) continue;
  console.log(`${item.doc_id}  [${item.exception_flags.join(', ')}]`);
  for (const flag of item.exception_flags) {
    const evidence =
      flag === 'spec_mismatch' ? `규격="${item.observed.spec}"`
      : flag === 'unit_mismatch' ? `단위="${item.observed.unit}"`
      : flag === 'missing_required' ? '필수 필드'
      : `기준 ${item.duplicate_of}`;
    console.log(`   - ${flag} (${evidence})`);
    console.log(`     ${item.exception_reasons[flag] ?? '(사유 없음)'}`);
  }
  // 사유가 있는데 문구가 비어 있으면 화면에 표시할 게 없다는 뜻이라 실패로 본다
  const missingReason = item.exception_flags.filter((fl) => !item.exception_reasons[fl]);
  if (missingReason.length > 0) {
    failures += missingReason.length;
    console.log(`   FAIL 사유 문구 누락: ${missingReason.join(', ')}`);
  }
}

// ------------------------------------------------- 2차: 정규화 후보 출처 확인
console.log('');
console.log('='.repeat(72));
console.log('2. 정규화 품목명 후보 출처');
console.log('='.repeat(72));
const bySource = items.reduce<Record<string, number>>((acc, it) => {
  acc[it.normalization.source] = (acc[it.normalization.source] ?? 0) + 1;
  return acc;
}, {});
console.log(bySource);
console.log('예시:');
for (const it of items.slice(0, 3)) {
  console.log(
    `  ${it.doc_id}  ${it.observed.raw_item_name.padEnd(18)} -> ${it.current.normalized_item_name}  (${it.normalization.source})`,
  );
}

// --------------------------------------------- 3차: 하드코딩 없음 검증
console.log('');
console.log('='.repeat(72));
console.log('3. 하드코딩 없음 검증 (문서ID 변경 + 행 순서 섞기)');
console.log('='.repeat(72));

/** 문서ID를 새로 매기고 행 순서를 뒤집은 입력을 만든다. */
function remap(idFor: (idx: number) => string) {
  const idMap = new Map<string, string>();
  const rows: ParsedRow[] = parsed.rows.map((row, idx) => {
    const newId = idFor(idx);
    idMap.set(row.values['문서ID'], newId);
    return { rowNo: row.rowNo, values: { ...row.values, '문서ID': newId } };
  });
  rows.reverse(); // 행 순서도 섞는다
  return { idMap, items: buildItems(rows, 'shuffled.csv') };
}

// (a) 문서ID를 전부 바꾸되 대소 순서는 유지 + 행 순서만 뒤집기
//     판정이 데이터에서 나온다면 모든 항목의 플래그가 그대로여야 한다.
const ascending = remap((idx) => `EVD-${String(100 + idx).padStart(3, '0')}`);
const byNewId = new Map(ascending.items.map((i) => [i.doc_id, i]));

let mismatch = 0;
for (const original of items) {
  const moved = byNewId.get(ascending.idMap.get(original.doc_id)!)!;
  const a = sorted(original.exception_flags);
  const b = sorted(moved.exception_flags);
  if (a !== b) {
    mismatch += 1;
    console.log(`  FAIL ${original.doc_id} -> ${moved.doc_id}:  ${a}  vs  ${b}`);
  }
}
failures += mismatch;
if (mismatch === 0) {
  console.log('  (a) 문서ID를 전부 바꾸고 행 순서를 뒤집어도 20건 판정이 모두 동일했다.');
  console.log('      -> 판정이 문서ID가 아니라 데이터에서 나온다는 증거.');
}

// (b) 문서ID 대소 순서를 반대로 매기면 중복 그룹의 기준 항목이 바뀌어야 한다.
//     명세: "문서ID 오름차순, 그룹의 첫 건은 기준 항목, 두 번째 이후에 중복 의심"
const descending = remap((idx) => `EVD-${String(900 - idx).padStart(3, '0')}`);
const flippedDup = descending.items.find((i) =>
  i.exception_flags.includes('duplicate_suspected'),
);
const originalDup = items.find((i) => i.exception_flags.includes('duplicate_suspected'));

// 원본에서 DOC-018(뒤 ID)이 중복이었으므로, ID 순서를 뒤집으면
// 원래 DOC-017이었던 항목이 중복으로 잡혀야 한다.
const expectedFlipped = descending.idMap.get('DOC-017');
const flipOk = flippedDup?.doc_id === expectedFlipped;
if (!flipOk) failures += 1;

console.log('');
console.log(`  (b) 원본      중복 의심: ${originalDup?.doc_id} (기준 ${originalDup?.duplicate_of})`);
console.log(
  `      ID 순서 반전: ${flippedDup?.doc_id} (기준 ${flippedDup?.duplicate_of})  ${flipOk ? 'PASS' : 'FAIL'}`,
);
console.log('      -> 기준 항목이 문서ID 순서를 따라 바뀐다. 특정 ID에 고정돼 있지 않다.');

// ---------------------------------------------------------------- 결과
console.log('');
console.log('='.repeat(72));
if (failures === 0) {
  console.log('전체 통과. 기대 결과와 모두 일치했다.');
  process.exit(0);
} else {
  console.log(`실패 ${failures}건. 위 FAIL 항목을 확인할 것.`);
  process.exit(1);
}
