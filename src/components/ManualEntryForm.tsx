'use client';

import { useMemo, useState } from 'react';
import { validateFormats } from '@/lib/validateFormat';
import { REQUIRED_COLUMNS, STANDARD_UNITS, type CurrentFields } from '@/lib/types';

/** 원본유형은 명세가 정한 네 가지다. 수기 등록이므로 기본값은 `수기`. */
const SOURCE_TYPES = ['수기', 'PDF', 'XLSX', 'IMAGE'] as const;

const EMPTY: Record<string, string> = {
  '문서ID': '',
  '원본유형': '수기',
  '공급사': '',
  '원문 품목명': '',
  '규격': '',
  '단위': '',
  '기존단가(원)': '',
  '변경단가(원)': '',
  '적용일': '',
};

/** 폼 값을 형식 검증에 넣기 위한 최소 형태로 옮긴다. */
function toFields(values: Record<string, string>): CurrentFields {
  return {
    source_type: values['원본유형'],
    supplier_name: values['공급사'],
    raw_item_name: values['원문 품목명'],
    spec: values['규격'],
    unit: values['단위'],
    price_before: values['기존단가(원)'],
    price_after: values['변경단가(원)'],
    effective_date: values['적용일'],
    normalized_item_name: '',
  };
}

export function ManualEntryForm({
  onSubmit,
}: {
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(EMPTY);

  const missing = useMemo(
    () => REQUIRED_COLUMNS.filter((c) => (values[c] ?? '').trim() === ''),
    [values],
  );
  // 파일로 들어온 항목과 같은 검증기를 쓴다. 규칙이 두 벌이 되면 어긋난다.
  const formatErrors = useMemo(() => validateFormats(toFields(values)), [values]);

  const set = (column: string, v: string) =>
    setValues((prev) => ({ ...prev, [column]: v }));

  const submit = () => {
    onSubmit(values);
    setValues(EMPTY);
    setOpen(false);
  };

  if (!open) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-navy">직접 등록</h2>
          <span className="text-xs text-slate-500">
            공급사가 전화나 구두로 알려온 인상분을 파일 없이 넣습니다
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto rounded-md border border-navy px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy-soft"
          >
            등록 폼 열기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-navy bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-navy">직접 등록</h2>
        <span className="text-xs text-slate-500">
          파일로 올린 항목과 같은 판정을 거칩니다
        </span>
        <button
          type="button"
          onClick={() => { setValues(EMPTY); setOpen(false); }}
          className="ml-auto rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          닫기
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {REQUIRED_COLUMNS.map((column) => {
          const failed = formatErrors.find(
            (e) =>
              (e.field === 'price_before' && column === '기존단가(원)') ||
              (e.field === 'price_after' && column === '변경단가(원)') ||
              (e.field === 'effective_date' && column === '적용일'),
          );
          return (
            <label key={column} className="block">
              <span className="text-xs text-slate-600">
                {column}
                <span className="ml-1 text-rose-500">*</span>
              </span>

              {column === '원본유형' ? (
                <select
                  value={values[column]}
                  onChange={(e) => set(column, e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-navy"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[column]}
                  onChange={(e) => set(column, e.target.value)}
                  placeholder={PLACEHOLDER[column]}
                  className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-navy ${
                    failed ? 'border-red-400 bg-red-50' : 'border-slate-300'
                  }`}
                />
              )}

              {failed && (
                <span className="mt-0.5 block text-[11px] text-red-700">{failed.reason}</span>
              )}
            </label>
          );
        })}
      </div>

      {/* 입력 실패 이유를 등록 전에 알려준다(요건 ②: 입력 실패 이유와 다시 시도) */}
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        {missing.length === 0 && formatErrors.length === 0 ? (
          <p>지금 등록하면 <b>바로 검수 대기열</b>에 올라갑니다.</p>
        ) : (
          <>
            {missing.length > 0 && (
              <p>
                비어 있는 필수값 {missing.length}개:{' '}
                <b>{missing.join(', ')}</b>
              </p>
            )}
            {formatErrors.length > 0 && (
              <p className={missing.length > 0 ? 'mt-1' : ''}>
                형식을 읽지 못한 값 {formatErrors.length}개
              </p>
            )}
            <p className="mt-1 text-slate-500">
              이대로 등록해도 됩니다. <b>확인 필요</b> 상태로 들어가고, 목록에서 값을 고치면 풀립니다.
              적용일이 아직 미정인 공문을 먼저 기록해 두는 경우가 실제로 있어 등록을 막지 않습니다.
            </p>
          </>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          className="rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-mid"
        >
          검수 대기열에 등록
        </button>
        <button
          type="button"
          onClick={() => setValues(EMPTY)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          입력값 지우기
        </button>
      </div>
    </section>
  );
}

/**
 * 입력 힌트. 제공 20건의 값을 쓰지 않는다.
 *
 * 판정에 쓰이는 값이 아니라 빈 칸에 보이는 안내일 뿐이지만, 소스에 그 데이터가
 * 있으면 "결과를 미리 박아 두었다"는 오해를 살 수 있다. 명세가 금지한 것은
 * 문서ID별 예외 결과 하드코딩이고 여기 값은 판정에 관여하지 않지만,
 * 오해할 여지를 남기지 않는 편이 낫다.
 */
const PLACEHOLDER: Record<string, string> = {
  '문서ID': '증빙 문서 번호',
  '공급사': '공급사 이름',
  '원문 품목명': '공급사 표기 그대로',
  '규격': '예: 1kg/PK',
  '단위': STANDARD_UNITS.join(' · '),
  '기존단가(원)': '숫자만',
  '변경단가(원)': '숫자만',
  '적용일': 'YYYY-MM-DD',
};
