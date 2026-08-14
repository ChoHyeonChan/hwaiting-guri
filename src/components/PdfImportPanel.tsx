'use client';

import { useRef, useState } from 'react';
import { extractRowsFromPdf, type ExtractResult } from '@/lib/pdfExtract';
import { REQUIRED_COLUMNS } from '@/lib/types';

/** 추출한 행 + 사람이 채워 넣는 값 */
interface Draft {
  values: Record<string, string>;
  page: number;
  /** 목록에 넣을지 */
  selected: boolean;
}

const FILL_BY_HAND = ['문서ID', '공급사'] as const;

export function PdfImportPanel({
  onRegister,
}: {
  /** 쪽 번호와 파일명을 함께 넘긴다. 목록에서 어느 공문 몇 쪽인지 되짚을 수 있어야 한다 */
  onRegister: (
    rows: { values: Record<string, string>; pageNo: number }[],
    fileName: string,
  ) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [fileName, setFileName] = useState('');
  /** 문서ID·공급사는 표 밖에 있어 한 번에 채우게 한다 */
  const [common, setCommon] = useState({ '문서ID': '', '공급사': '' });

  const read = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    const extracted = await extractRowsFromPdf(file);
    setResult(extracted);
    setDrafts(
      extracted.rows.map((r) => ({
        values: { ...r.values, '원본유형': 'PDF' },
        page: r.page,
        selected: true,
      })),
    );
    setBusy(false);
  };

  const register = () => {
    const chosen = drafts.filter((d) => d.selected);
    onRegister(
      chosen.map((d, i) => ({
        values: {
          ...d.values,
          // 문서ID를 비워 두면 필수값 누락으로 잡힌다. 여러 건이면 뒤에 번호를 붙인다.
          '문서ID': common['문서ID']
            ? chosen.length > 1 ? `${common['문서ID']}-${i + 1}` : common['문서ID']
            : '',
          '공급사': common['공급사'],
        },
        pageNo: d.page,
      })),
      fileName,
    );
    setResult(null);
    setDrafts([]);
    setCommon({ '문서ID': '', '공급사': '' });
    setOpen(false);
  };

  if (!open) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-navy">PDF 공문에서 읽기</h2>
          <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">
            추가 기능
          </span>
          <span className="text-xs text-slate-500">
            단가 변경 공문에서 표를 찾아 후보를 만듭니다
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto rounded-md border border-navy px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy-soft"
          >
            PDF 열기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-navy bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-navy">PDF 공문에서 읽기</h2>
        <span className="text-xs text-slate-500">
          읽은 결과를 확인하고 고친 뒤 목록에 넣습니다
        </span>
        <button
          type="button"
          onClick={() => { setResult(null); setDrafts([]); setOpen(false); }}
          className="ml-auto rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          닫기
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) read(file);
          e.target.value = '';
        }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-mid disabled:opacity-50"
        >
          {busy ? '읽는 중…' : 'PDF 파일 선택'}
        </button>
        {fileName && <span className="font-mono text-xs text-slate-500">{fileName}</span>}
      </div>

      {result && (
        <>
          {/* 못 읽은 이유를 그대로 보여준다. 명세가 실패 사례 기록을 요구한다 */}
          {result.problems.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              {result.problems.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          )}

          {drafts.length > 0 && (
            <>
              <p className="mt-3 text-sm text-slate-700">
                {result.pageCount}쪽에서 <b>{drafts.length}건</b>을 읽었습니다.
                표 밖에 있는 값은 아래에서 채워 주세요.
              </p>

              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {FILL_BY_HAND.map((column) => (
                  <label key={column} className="block">
                    <span className="text-xs text-slate-600">
                      {column}
                      <span className="ml-1 text-slate-400">
                        {column === '문서ID' ? '(여러 건이면 뒤에 번호가 붙습니다)' : ''}
                      </span>
                    </span>
                    <input
                      value={common[column]}
                      onChange={(e) => setCommon((prev) => ({ ...prev, [column]: e.target.value }))}
                      placeholder={column === '문서ID' ? '증빙 문서 번호' : '공급사 이름'}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-navy"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-surface text-navy">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">넣기</th>
                      <th className="px-2 py-1.5 font-medium">쪽</th>
                      {REQUIRED_COLUMNS.filter(
                        (c) => c !== '문서ID' && c !== '공급사' && c !== '원본유형',
                      ).map((c) => (
                        <th key={c} className="px-2 py-1.5 font-medium">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((draft, index) => (
                      <tr key={`${draft.page}:${index}`} className="border-b border-slate-100">
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={draft.selected}
                            onChange={(e) =>
                              setDrafts((prev) =>
                                prev.map((d, i) =>
                                  i === index ? { ...d, selected: e.target.checked } : d,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-1 text-slate-400">{draft.page}</td>
                        {REQUIRED_COLUMNS.filter(
                          (c) => c !== '문서ID' && c !== '공급사' && c !== '원본유형',
                        ).map((column) => (
                          <td key={column} className="px-1 py-1">
                            <input
                              value={draft.values[column] ?? ''}
                              onChange={(e) =>
                                setDrafts((prev) =>
                                  prev.map((d, i) =>
                                    i === index
                                      ? { ...d, values: { ...d.values, [column]: e.target.value } }
                                      : d,
                                  ),
                                )
                              }
                              className="w-full min-w-24 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] outline-none hover:border-slate-300 focus:border-navy focus:bg-white"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-xs text-slate-500">
                읽은 값이 맞는지 확인하고 고칠 수 있습니다. 넣으면 파일·수기 등록과 같은
                판정을 거치므로, 비어 있는 값과 형식 오류는 검수 목록에서 다시 표시됩니다.
              </p>

              <button
                type="button"
                onClick={register}
                disabled={drafts.every((d) => !d.selected)}
                className="mt-3 rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-mid disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                고른 {drafts.filter((d) => d.selected).length}건을 검수 대기열에 넣기
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
