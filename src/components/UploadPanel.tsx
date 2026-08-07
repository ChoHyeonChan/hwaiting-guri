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
  onLoad: (file: File) => void;
  onReset: () => void;
}

export function UploadPanel({
  fileName, loadState, errorMessage, warnings, total, exception, onLoad, onReset,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-800">증빙 자료 받기</h2>
        <span className="text-xs text-slate-500">CSV 파일 (UTF-8)</span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loadState === 'loading'}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
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

      {/* success - 오류가 나도 이미 받아둔 목록은 그대로 보여준다 */}
      {fileName && total > 0 && (
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-mono text-xs text-slate-500">{fileName}</span>
          {' · '}
          전체 <b>{total}</b>건 · 확인 필요 <b>{exception}</b>건 · 정상{' '}
          <b>{total - exception}</b>건
        </p>
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
