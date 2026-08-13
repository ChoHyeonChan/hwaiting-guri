'use client';

import { useMemo } from 'react';
import { buildExport, toCsv, toJson } from '@/lib/exportData';
import { FIELD_LABEL } from '@/lib/labels';
import type { Item } from '@/lib/types';

/** 파일 이름에 쓸 날짜. 내보낸 시점을 파일명에 남겨 두면 여러 번 받아도 구분된다. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function download(text: string, fileName: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ items }: { items: Item[] }) {
  const result = useMemo(() => buildExport(items), [items]);
  const { rows, issues, excluded } = result;

  const approvedCount = rows.length;
  const nothingToExport = approvedCount === 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-navy">ComfoziAI로 내보내기</h2>
        <span className="text-xs text-slate-500">승인된 항목만 나갑니다</span>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={nothingToExport}
            onClick={() => download(toJson(rows), `comfozi_approved_${today()}.json`, 'application/json')}
            className="rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-mid disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            JSON 내려받기
          </button>
          <button
            type="button"
            disabled={nothingToExport}
            onClick={() => download(toCsv(rows), `comfozi_approved_${today()}.csv`, 'text/csv')}
            className="rounded-md border border-navy px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy-soft disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            CSV 내려받기
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-700">
        전체 {items.length}건 중 <b>승인 {approvedCount}건</b>이 대상입니다.
        {items.length > 0 && (
          <span className="text-slate-500">
            {' '}승인 전·보류·반려 {items.length - approvedCount}건은 제외됩니다.
          </span>
        )}
      </p>

      {/* 내보낼 것이 없을 때 왜 없는지 알려준다 */}
      {nothingToExport && (
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
          아직 승인한 항목이 없습니다. 목록에서 항목을 검수하고 승인하면 내려받을 수 있습니다.
        </p>
      )}

      {/* 요건 ⑦ 세부설명: 출력 유효성 오류 표시 */}
      {issues.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            출력 유효성 오류 {issues.length}건
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            승인은 되었지만 앞단이 그대로 쓰기 어려운 값입니다. 내려받기는 막지 않되 여기에 남깁니다.
          </p>
          <ul className="mt-2 space-y-1">
            {issues.map((issue) => (
              <li key={`${issue.uid}:${issue.field}`} className="text-xs text-amber-900">
                <span className="font-mono">{issue.doc_id}</span>{' '}
                <span className="text-amber-700">{FIELD_LABEL[issue.field] ?? issue.field}</span>
                {' — '}
                {issue.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 정상 흐름에서는 비어 있어야 한다. 비어 있지 않으면 상태 계산에 문제가 있다는 신호다 */}
      {excluded.length > 0 && (
        <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
          <p className="font-medium">승인 상태지만 조건을 잃어 제외된 항목 {excluded.length}건</p>
          <ul className="mt-1 space-y-0.5">
            {excluded.map((e) => (
              <li key={e.doc_id}>
                <span className="font-mono">{e.doc_id}</span> — {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {approvedCount > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          JSON은 명세 §7 권장 스키마를 따르고, CSV는 같은 내용을 평탄화해 UTF-8로 씁니다.
          예외를 수용해 승인한 항목은 <span className="font-mono">exception_flags</span>와
          검수 메모가 함께 나갑니다.
        </p>
      )}
    </section>
  );
}
