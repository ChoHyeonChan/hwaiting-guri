'use client';

import { useRef } from 'react';
import type { LoadState } from '@/lib/store';

interface Props {
  fileName: string | null;
  loadState: LoadState;
  errorMessage: string;
  warnings: string[];
  total: number;
  exception: number;
  batchCount: number;
  lastIntake: { batchNo: number; added: number; duplicates: number } | null;
  pendingFile: { name: string; text: string } | null;
  onLoad: (file: File) => void;
  onReset: () => void;
  onConfirmPending: () => void;
  onCancelPending: () => void;
  onLoadSample: () => void;
}

export function UploadPanel({
  fileName, loadState, errorMessage, warnings, total, exception,
  batchCount, lastIntake, pendingFile,
  onLoad, onReset, onConfirmPending, onCancelPending, onLoadSample,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-navy">증빙 자료 받기</h2>
        <span className="text-xs text-slate-500">CSV 파일 (UTF-8)</span>
        <div className="ml-auto flex gap-2">
          {/* 파일이 없는 사람도 전체 흐름을 볼 수 있게 한다. 결과를 박아 둔 것이
              아니라 내장한 CSV를 같은 파서·판정에 태운다 */}
          <button
            type="button"
            onClick={onLoadSample}
            disabled={loadState === 'loading'}
            className="rounded-md border border-gold bg-gold-soft px-3 py-1.5 text-sm font-medium text-navy hover:bg-gold-line disabled:opacity-50"
          >
            예시 데이터로 바로 보기
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loadState === 'loading'}
            className="rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-mid disabled:opacity-50"
          >
            {loadState === 'loading' ? '읽는 중…' : '파일 선택'}
          </button>
          {fileName && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              비우기
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onLoad(file);
          e.target.value = ''; // 같은 파일을 다시 골라도 이벤트가 뜨게 한다
        }}
      />

      {/* 같은 파일을 또 올렸을 때 — 조용히 무시하지도, 조용히 넣지도 않는다 */}
      {pendingFile && (
        <div className="mt-3 rounded-md border border-gold-line bg-gold-soft p-3">
          <p className="text-sm font-medium text-navy">이미 올린 파일과 내용이 같습니다</p>
          <p className="mt-1 text-xs text-slate-700">
            <span className="font-mono">{pendingFile.name}</span> 은(는) 이전에 인입한 파일과
            내용이 동일합니다. 계속 진행하면 새 항목으로 인입되고,{' '}
            <b>같은 내용의 기존 항목이 있는 건은 중복 의심으로 표시</b>됩니다.
            공급사 재발송이나 실수로 두 번 올린 경우를 담당자가 확인할 수 있게 하기 위한 절차입니다.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onConfirmPending}
              className="rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-mid"
            >
              계속 진행
            </button>
            <button
              type="button"
              onClick={onCancelPending}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* success - 오류가 나도 이미 받아둔 목록은 그대로 보여준다 */}
      {fileName && total > 0 && (
        <div className="mt-3 text-sm text-slate-700">
          <p>
            <span className="font-mono text-xs text-slate-500">{fileName}</span>
            {' · '}
            {/* "확인 필요"는 상태 배지 이름이라 여기서는 쓰지 않는다.
                이 숫자는 예외나 형식 오류가 하나라도 있는 건 전체를 뜻한다 */}
            전체 <b>{total}</b>건 · 확인 대상 <b>{exception}</b>건 · 정상{' '}
            <b>{total - exception}</b>건
            {batchCount > 1 && (
              <span className="ml-1 rounded border border-gold-line bg-gold-soft px-1.5 py-0.5 text-[11px] text-navy">
                인입 {batchCount}회 누적
              </span>
            )}
          </p>
          {lastIntake && lastIntake.batchNo > 1 && (
            <p className="mt-1 text-xs text-slate-600">
              방금 {lastIntake.batchNo}번째 인입으로 <b>{lastIntake.added}건</b>이 추가됐고,
              그중 <b>{lastIntake.duplicates}건</b>이 기존 항목과 같아 중복 의심으로 분류됐습니다.
            </p>
          )}
        </div>
      )}

      {/* error - 이유와 다시 시도 방법을 함께 보여준다 */}
      {loadState === 'error' && (
        <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3">
          <p className="text-sm font-medium text-rose-900">파일을 읽지 못했습니다</p>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-rose-800">{errorMessage}</pre>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs text-rose-900 hover:bg-rose-100"
          >
            다시 시도
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
