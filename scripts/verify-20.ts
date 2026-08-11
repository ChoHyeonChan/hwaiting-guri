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
import { buildItems, canApprove, recomputeItems } from '../src/lib/pipeline';
import {
  approve as reviewApprove,
  editField as reviewEdit,
  setMemo as reviewSetMemo,
  toggleDuplicateDismissed as reviewDismiss,
} from '../src/lib/review';
import type { ExceptionFlag, ReviewStatus } from '../src/lib/types';

/** 명세가 정한 예외 4종. 형식 검증이 여기에 5번째를 끼워넣지 않았는지 확인하는 데 쓴다. */
const FLAG_SET = new Set<ExceptionFlag>([
  'missing_required',
  'spec_mismatch',
  'unit_mismatch',
  'duplicate_suspected',
]);

const CSV_NAME = '42_해커톤_업로드용_증빙20건_2026-08-04.csv';
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

/**
 * 표시 폭 기준으로 오른쪽을 공백으로 채운다.
 *
 * String.padEnd는 글자 수로 세는데 한글은 콘솔에서 두 칸을 차지한다.
 * 한글이 섞인 헤더에 padEnd를 쓰면 열이 데이터 행과 어긋난다.
 * 이 출력을 그대로 검증 자료로 내보내므로 폭을 맞춘다.
 */
function pad(text: string, width: number): string {
  const shown = [...text].reduce(
    (n, ch) => n + (ch.codePointAt(0)! > 0x10ff ? 2 : 1),
    0,
  );
  return text + ' '.repeat(Math.max(0, width - shown));
}

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
    pad(h, [9, 4, 34, 14, 6][i]),
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
      pad(item.doc_id, 9) +
        pad(String(item.source_ref.row_no), 4) +
        pad(actualFlags, 34) +
        pad(item.review_status, 14) +
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
    `  ${it.doc_id}  ${pad(it.observed.raw_item_name, 18)} -> ${it.current.normalized_item_name}  (${it.normalization.source})`,
  );
}

// --------------------------------------------- 3차: 하드코딩 없음 검증
console.log('');
console.log('='.repeat(72));
console.log('3. 하드코딩 없음 검증 (문서ID 변경 + 행 순서 섞기)');
console.log('='.repeat(72));

// (a) 문서ID만 전부 바꾸고 행 순서는 그대로 두면 판정이 동일해야 한다.
//     인입 순서가 같으므로 중복 그룹의 기준 항목도 그대로다.
const renamedRows: ParsedRow[] = parsed.rows.map((row, idx) => ({
  rowNo: row.rowNo,
  values: { ...row.values, '문서ID': `EVD-${String(100 + idx).padStart(3, '0')}` },
}));
const renamed = buildItems(renamedRows, 'renamed.csv');

let mismatch = 0;
items.forEach((original, idx) => {
  const moved = renamed[idx];
  const a = sorted(original.exception_flags);
  const b = sorted(moved.exception_flags);
  if (a !== b) {
    mismatch += 1;
    console.log(`  FAIL ${original.doc_id} -> ${moved.doc_id}:  ${a}  vs  ${b}`);
  }
});
failures += mismatch;
if (mismatch === 0) {
  console.log('  (a) 문서ID를 전부 바꿔도 20건 판정이 모두 동일했다.');
  console.log('      -> 판정이 문서ID가 아니라 데이터에서 나온다는 증거.');
}

// (b) 행 순서를 뒤집으면 중복 그룹의 기준 항목이 따라 바뀌어야 한다.
//     명세 §2의 "문서ID 오름차순"은 단일 파일 전제이고, 회신(2026-08-11)에서
//     업로드가 여러 번이면 "시스템 인입 순서"로 일반화하도록 확정됐다.
//     먼저 들어온 쪽이 기준이므로, 순서를 뒤집으면 기준도 뒤바뀐다.
const reversedRows = [...parsed.rows].reverse();
const reversed = buildItems(reversedRows, 'reversed.csv');

const originalDup = items.find((i) => i.exception_flags.includes('duplicate_suspected'));
const reversedDup = reversed.find((i) => i.exception_flags.includes('duplicate_suspected'));

// 원본은 DOC-017이 먼저 들어와 기준, DOC-018이 중복.
// 뒤집으면 DOC-018이 먼저라 기준이 되고 DOC-017이 중복으로 잡혀야 한다.
const flipOk =
  originalDup?.doc_id === 'DOC-018' &&
  originalDup?.duplicate_of_doc_id === 'DOC-017' &&
  reversedDup?.doc_id === 'DOC-017' &&
  reversedDup?.duplicate_of_doc_id === 'DOC-018';
if (!flipOk) failures += 1;

console.log('');
console.log(`  (b) 원본      중복 의심: ${originalDup?.doc_id} (기준 ${originalDup?.duplicate_of_doc_id})`);
console.log(
  `      행 순서 반전: ${reversedDup?.doc_id} (기준 ${reversedDup?.duplicate_of_doc_id})  ${flipOk ? 'PASS' : 'FAIL'}`,
);
console.log('      -> 기준 항목이 인입 순서를 따라 바뀐다. 특정 ID에 고정돼 있지 않다.');

// ------------------------------------------- 4차: 같은 파일 2회 업로드
console.log('');
console.log('='.repeat(72));
console.log('4. 같은 파일 2회 업로드 (창업팀 회신 2026-08-11)');
console.log('='.repeat(72));

const twice = buildItems(parsed.rows, CSV_NAME, items, {
  batchNo: 2,
  startSeq: items.length,
});
const first = twice.slice(0, 20);
const second = twice.slice(20);

/** 2회차 기대: 1회차 플래그 + duplicate_suspected */
const expectedSecond: Record<string, string> = {
  'DOC-016': 'duplicate_suspected,missing_required',
  'DOC-019': 'duplicate_suspected,spec_mismatch',
  'DOC-020': 'duplicate_suspected,spec_mismatch,unit_mismatch',
};
const DEFAULT_SECOND = 'duplicate_suspected';

let firstChanged = 0;
items.forEach((before, i) => {
  if (sorted(before.exception_flags) !== sorted(first[i].exception_flags)) {
    firstChanged += 1;
    console.log(`  FAIL 1회차 ${before.doc_id} 판정이 바뀌었다`);
  }
});
failures += firstChanged;
if (firstChanged === 0) console.log('  1회차 20건은 판정 변화 없음 (기준 항목)');

let secondFail = 0;
for (const item of second) {
  const expected = expectedSecond[item.doc_id] ?? DEFAULT_SECOND;
  const actual = sorted(item.exception_flags);
  const statusExpected = item.exception_flags.includes('missing_required')
    ? 'needs_review'
    : 'on_hold';
  if (actual !== expected || item.review_status !== statusExpected) {
    secondFail += 1;
    console.log(`  FAIL 2회차 ${item.doc_id}: ${actual} / ${item.review_status}`);
    console.log(`       기대: ${expected} / ${statusExpected}`);
  }
}
failures += secondFail;
if (secondFail === 0) {
  console.log('  2회차 20건 전부 duplicate_suspected 부착, 고유 예외는 병기됨');
  console.log(`    DOC-016 -> ${sorted(second[15].exception_flags)} / ${second[15].review_status}`);
  console.log(`    DOC-020 -> ${sorted(second[19].exception_flags)} / ${second[19].review_status}`);
}

const uids = new Set(twice.map((i) => i.uid));
const uidOk = uids.size === 40;
if (!uidOk) failures += 1;
console.log(`  총 ${twice.length}건 · 고유 uid ${uids.size}개  ${uidOk ? 'PASS' : 'FAIL'}`);
console.log('    -> 문서ID가 겹쳐도 내부 식별자는 유일하다.');

// ------------------------------------------------- 5차: 값 형식 검증
console.log('');
console.log('='.repeat(72));
console.log('5. 값 형식 검증 (창업팀 회신 2절 · 체크리스트 4번)');
console.log('='.repeat(72));
console.log('제공 20건은 전부 정상값이라 형식 오류가 드러나지 않는다.');
console.log('깨진 값을 일부러 넣은 자체 제작 파일로 검사한다.');
console.log('');

interface FormatExpectation {
  /** 형식 오류가 난 필드들 */
  fields: string[];
  status: ReviewStatus;
  /** 승인 버튼이 열려 있어야 하는가 */
  approvable: boolean;
  note: string;
}

const FORMAT_EXPECTED: Record<string, FormatExpectation> = {
  'FMT-001': { fields: ['price_before'], status: 'needs_review', approvable: false, note: '기존단가가 한글' },
  'FMT-002': { fields: ['price_after'], status: 'needs_review', approvable: false, note: '변경단가에 단위 문자' },
  'FMT-003': { fields: ['effective_date'], status: 'needs_review', approvable: false, note: '월·일 범위 초과' },
  'FMT-004': { fields: ['effective_date'], status: 'needs_review', approvable: false, note: '달력에 없는 날(2026-02-30)' },
  'FMT-005': { fields: ['effective_date'], status: 'needs_review', approvable: false, note: '구분자가 슬래시' },
  'FMT-006': {
    fields: ['price_before', 'price_after', 'effective_date'],
    status: 'needs_review', approvable: false, note: '세 필드 동시 실패 - 첫 실패에서 멈추지 않는다',
  },
  'FMT-007': { fields: [], status: 'new', approvable: true, note: '천단위 콤마는 정상으로 읽는다' },
  'FMT-008': { fields: [], status: 'needs_review', approvable: false, note: '공란은 필수값 누락만 - 형식 오류로 중복 표시하지 않는다' },
  'FMT-009': { fields: ['price_before'], status: 'needs_review', approvable: false, note: '원 단위라 소수점을 받지 않는다' },
  'FMT-010': { fields: [], status: 'new', approvable: true, note: '전부 정상' },
};

const formatPath = resolve(import.meta.dirname, '../docs/형식오류_테스트.csv');
const formatItems = buildItems(
  parseEvidenceCsv(readFileSync(formatPath, 'utf8')).rows,
  '형식오류_테스트.csv',
);

console.log(
  ['문서ID', '형식 오류 필드', '상태', '승인', '판정'].map((h, i) =>
    pad(h, [9, 42, 14, 6, 6][i]),
  ).join(''),
);
console.log('-'.repeat(72));

for (const item of formatItems) {
  const expected = FORMAT_EXPECTED[item.doc_id];
  const actualFields = item.format_errors.map((e) => e.field);
  const approvable = canApprove(item);

  // 세 검사를 각각 변수에 담는다. &&로 이으면 첫 실패에서 단축돼 나머지가 집계되지 않는다.
  const fieldsOk = check('fields', sorted(actualFields), sorted(expected.fields));
  const statusOk = check('status', item.review_status, expected.status);
  const approvableOk = check('approvable', String(approvable), String(expected.approvable));
  const ok = fieldsOk && statusOk && approvableOk;

  console.log(
    [
      pad(item.doc_id, 9),
      pad(actualFields.join(', ') || '(없음)', 42),
      pad(item.review_status, 14),
      pad(approvable ? '가능' : '차단', 6),
      ok ? 'PASS' : 'FAIL',
    ].join(''),
  );
  if (!ok) {
    console.log(`   기대: ${sorted(expected.fields)} / ${expected.status} / ${expected.approvable ? '가능' : '차단'}`);
  }
}

console.log('');
console.log('실패 이유 문구 (담당자가 읽는 문장):');
for (const item of formatItems) {
  for (const error of item.format_errors) {
    console.log(`  ${item.doc_id}  ${error.reason}`);
  }
}

// 형식 오류가 예외 4종을 건드리지 않았는지 확인한다.
// 5번째 플래그를 추가했다면 20건 정답 대조가 흔들린다.
const flagPollution = formatItems.filter(
  (i) => i.format_errors.length > 0 && i.exception_flags.some((f) => !FLAG_SET.has(f)),
).length;
if (flagPollution > 0) failures += flagPollution;
console.log('');
console.log(
  `  예외 4종 밖의 플래그가 생겼는가: ${flagPollution === 0 ? '없음 PASS' : `${flagPollution}건 FAIL`}`,
);
console.log('    -> 형식 오류는 exception_flags를 건드리지 않는 별도 축이다.');

// 값을 고치면 풀리는지. 형식 오류는 담당자가 해소할 수 있어야 한다.
const broken = formatItems.find((i) => i.doc_id === 'FMT-001')!;
const fixed = recomputeItems(
  formatItems.map((i) =>
    i.uid === broken.uid ? { ...i, current: { ...i.current, price_before: '32000' } } : i,
  ),
).find((i) => i.doc_id === 'FMT-001')!;
const fixOk = fixed.format_errors.length === 0 && fixed.review_status === 'new' && canApprove(fixed);
if (!fixOk) failures += 1;
console.log('');
console.log(
  `  FMT-001 기존단가를 32000으로 고침 -> 오류 ${fixed.format_errors.length}건 / ${fixed.review_status} / ${canApprove(fixed) ? '승인 가능' : '승인 차단'}  ${fixOk ? 'PASS' : 'FAIL'}`,
);
console.log('    -> 형식 오류는 값을 고치면 풀린다. 영구 차단이 아니다.');

// ------------------------------------- 6차: 승인 뒤 값이 깨지는 경우
console.log('');
console.log('='.repeat(72));
console.log('6. 승인한 뒤에 값이 깨지면');
console.log('='.repeat(72));
console.log('승인은 그때의 값에 대한 판단이므로, 값이 바뀌어 승인 조건을 잃으면');
console.log('승인을 유지할 수 없다. 유지되면 깨진 값이 출력으로 나간다.');
console.log('');

const AT = '2026-08-12T00:00:00.000Z';

/** 승인한 항목 하나의 필드를 바꾸고 전체를 다시 판정한다 */
function approveThenEdit(field: 'price_before' | 'effective_date', value: string) {
  const base = buildItems(parsed.rows, CSV_NAME);
  const target = base.find((i) => i.doc_id === 'DOC-001')!;
  const approved = recomputeItems(
    base.map((i) => (i.uid === target.uid ? reviewApprove(i, AT) : i)),
    AT,
  );
  const edited = recomputeItems(
    approved.map((i) => (i.uid === target.uid ? reviewEdit(i, field, value, AT) : i)),
    AT,
  );
  return {
    approved: approved.find((i) => i.doc_id === 'DOC-001')!,
    edited: edited.find((i) => i.doc_id === 'DOC-001')!,
  };
}

for (const scenario of [
  { label: '단가를 정수로 못 읽는 값으로', field: 'price_before' as const, value: '삼만원' },
  { label: '필수값인 적용일을 비움', field: 'effective_date' as const, value: '' },
]) {
  const { approved, edited } = approveThenEdit(scenario.field, scenario.value);
  const logged = edited.change_log.at(-1)?.action === 'unapprove';
  const ok =
    approved.review_status === 'approved' &&
    edited.review_status === 'needs_review' &&
    !canApprove(edited) &&
    edited.reviewed_at === null &&
    logged;
  if (!ok) failures += 1;

  console.log(`  ${scenario.label}`);
  console.log(
    `    승인 -> ${edited.review_status} · 승인 ${canApprove(edited) ? '가능' : '차단'} · 이력 ${logged ? 'unapprove 남음' : '없음'}  ${ok ? 'PASS' : 'FAIL'}`,
  );
}

// 값을 되돌려도 시스템이 알아서 다시 승인하지는 않아야 한다.
const base = buildItems(parsed.rows, CSV_NAME);
const t = base.find((i) => i.doc_id === 'DOC-001')!;
const cycled = recomputeItems(
  recomputeItems(
    recomputeItems(base.map((i) => (i.uid === t.uid ? reviewApprove(i, AT) : i)), AT)
      .map((i) => (i.uid === t.uid ? reviewEdit(i, 'price_before', '삼만원', AT) : i)),
    AT,
  ).map((i) => (i.uid === t.uid ? reviewEdit(i, 'price_before', '32000', AT) : i)),
  AT,
).find((i) => i.doc_id === 'DOC-001')!;

const noAutoApprove = cycled.review_status === 'new' && canApprove(cycled);
if (!noAutoApprove) failures += 1;
console.log('');
console.log(
  `  값을 정상으로 되돌림 -> ${cycled.review_status}  ${noAutoApprove ? 'PASS' : 'FAIL'}`,
);
console.log('    -> 자동으로 다시 승인하지 않는다. 승인은 사람이 다시 누른다.');

// --------------------------------- 7차: 예외 수용 승인에는 근거가 필요하다
console.log('');
console.log('='.repeat(72));
console.log('7. 예외를 수용해 승인할 때 판단 근거 요구 (전체팀 공지 2026-08-09 §1)');
console.log('='.repeat(72));
console.log('공지: "아무 검토 없이 예외 상태를 승인하는 흐름은 허용하지 않습니다."');
console.log('      "현재 값을 그대로 수용해 승인하면 exception_flags와 승인 사유를 함께 보존합니다."');
console.log('');

const memoBase = buildItems(parsed.rows, CSV_NAME);
const withMemo = (docId: string, memo: string) =>
  recomputeItems(
    memoBase.map((i) => (i.doc_id === docId ? reviewSetMemo(i, memo) : i)),
    AT,
  ).find((i) => i.doc_id === docId)!;

for (const c of [
  { docId: 'DOC-019', memo: '', can: false, note: '예외 있음 · 메모 없음 -> 차단' },
  { docId: 'DOC-019', memo: '공급사 확인 후 규격 변경 수용', can: true, note: '예외 있음 · 메모 있음 -> 승인 가능' },
  { docId: 'DOC-001', memo: '', can: true, note: '예외 없음 · 메모 없음 -> 승인 가능(근거 요구 안 함)' },
]) {
  const item = withMemo(c.docId, c.memo);
  const ok = check('memoGate', String(canApprove(item)), String(c.can));
  console.log(`  ${pad(c.note, 52)} ${ok ? 'PASS' : `FAIL (실제 ${canApprove(item)})`}`);
}

// 해소한 경우에는 근거를 요구하지 않아야 한다.
// DOC-018은 중복 의심인데, "중복 아님"으로 되돌리면 남은 예외가 없다.
const dismissed = recomputeItems(
  memoBase.map((i) => (i.doc_id === 'DOC-018' ? reviewDismiss(i, AT) : i)),
  AT,
).find((i) => i.doc_id === 'DOC-018')!;
const dismissOk = check('dismissGate', String(canApprove(dismissed)), 'true');
console.log(
  `  ${pad('중복 아님으로 해소 · 메모 없음 -> 승인 가능', 52)} ${dismissOk ? 'PASS' : 'FAIL'}`,
);
console.log('    -> 근거를 요구하는 것은 예외를 "수용"할 때뿐이다. "해소"에는 요구하지 않는다.');

// 승인 후 메모를 지우면 승인이 풀리는지. 근거가 사라지면 승인도 유지될 수 없다.
const approvedWithMemo = recomputeItems(
  memoBase.map((i) => (i.doc_id === 'DOC-019' ? reviewApprove(reviewSetMemo(i, '수용 사유'), AT) : i)),
  AT,
);
const memoErased = recomputeItems(
  approvedWithMemo.map((i) => (i.doc_id === 'DOC-019' ? reviewSetMemo(i, '') : i)),
  AT,
).find((i) => i.doc_id === 'DOC-019')!;
const eraseOk = check('memoErase', memoErased.review_status, 'on_hold');
console.log('');
console.log(
  `  승인 후 메모를 지움 -> ${memoErased.review_status} (근거가 사라지면 승인도 풀린다)  ${eraseOk ? 'PASS' : 'FAIL'}`,
);

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
