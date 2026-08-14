'use client';

import { effectiveFlags, approvalBlock } from '@/lib/pipeline';
import {
  FIELD_LABEL, FLAG_LABEL, FLAG_STYLE, FORMAT_ERROR_LABEL, FORMAT_ERROR_STYLE,
  NORMALIZATION_SOURCE_LABEL, STATUS_LABEL, STATUS_STYLE, flagEvidence,
} from '@/lib/labels';
import { INSUFFICIENT_LABEL } from '@/lib/normalize';
import { ReviewActions } from './ReviewActions';
import { ChangeLogPanel } from './ChangeLogPanel';
import type { CurrentFields, Item, ItemFields } from '@/lib/types';

const OBSERVED_FIELDS: (keyof ItemFields)[] = [
  'source_type', 'supplier_name', 'raw_item_name', 'spec', 'unit',
  'price_before', 'price_after', 'effective_date',
];

/**
 * 검수 동작 핸들러.
 *
 * 인자는 전부 **uid**다. 문서ID는 재업로드로 중복되므로 항목을 특정하지 못한다.
 * 예전에 파라미터 이름이 docId였을 때 검수 메모가 doc_id를 넘겨 저장되지 않는
 * 버그가 있었다. 이름을 uid로 못박아 같은 실수를 막는다.
 */
export interface ReviewHandlers {
  editField: (uid: string, field: keyof CurrentFields, value: string) => void;
  approve: (uid: string) => void;
  reject: (uid: string) => void;
  reopen: (uid: string) => void;
  toggleDuplicateDismissed: (uid: string) => void;
  setMemo: (uid: string, memo: string) => void;
}

interface Props {
  item: Item | null;
  onSelect: (uid: string) => void;
  actions: ReviewHandlers;
}

export function ItemDetail({ item, onSelect, actions }: Props) {
  if (!item) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white px-4 py-14 text-center text-sm text-slate-500">
        목록에서 항목을 선택하면 원본 근거와 대기 이유가 표시됩니다.
      </section>
    );
  }

  const flags = effectiveFlags(item);
  const block = approvalBlock(item);

  return (
    <section className="space-y-3">
      {/* 머리말: 상태와 원본 근거 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-navy">{item.doc_id}</span>
          <span className={`rounded border px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[item.review_status]}`}>
            {STATUS_LABEL[item.review_status]}
          </span>
          {block && (
            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900">
              {block.short}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          출처{' '}
          {item.source_ref.input_method === 'file' ? (
            <>
              <span className="font-mono">{item.source_ref.file_name}</span>
              {' · '}
              <b>{item.source_ref.row_no}행</b>
              <span className="text-slate-400"> (헤더 포함)</span>
            </>
          ) : (
            '화면에서 직접 입력'
          )}
        </p>

        {/* 파일에 실제로 적혀 있던 한 줄. 관찰값은 공백을 다듬은 뒤라 원문과 다를 수 있다 */}
        {item.source_ref.raw_line !== '' && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-navy">
              원본 행 원문 보기
            </summary>
            <pre className="mt-1 overflow-x-auto rounded border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-700">
              {item.source_ref.raw_line}
            </pre>
          </details>
        )}
      </div>

      {/* 형식 오류: 값은 있는데 정수·날짜로 읽지 못한 경우. 예외 4종과 분리해서 보여준다 */}
      {item.format_errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-red-900">
            형식을 고쳐야 합니다{' '}
            <span className="text-red-400">({item.format_errors.length}건)</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            값은 들어 있으나 정수·날짜로 읽지 못했습니다. 읽기를 중단하지 않고 사유만 남깁니다.
          </p>
          <ul className="mt-2 space-y-2">
            {item.format_errors.map((error) => (
              <li key={error.field} className="rounded-md border border-red-200 bg-red-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[11px] ${FORMAT_ERROR_STYLE}`}>
                    {FORMAT_ERROR_LABEL}
                  </span>
                  <span className="text-xs text-slate-500">
                    {FIELD_LABEL[error.field]}{' '}
                    <span className="font-mono text-slate-700">{error.value}</span>
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{error.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 대기 이유: 사유마다 별도 항목 + 근거가 된 원본 값 */}
      {flags.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-navy">
            확인이 필요한 이유 <span className="text-slate-400">({flags.length}건)</span>
          </h3>
          <ul className="mt-2 space-y-2">
            {flags.map((flag) => {
              const evidence = flagEvidence(item, flag);
              return (
                <li key={flag} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${FLAG_STYLE[flag]}`}>
                      {FLAG_LABEL[flag]}
                    </span>
                    <span className="text-xs text-slate-500">
                      {evidence.label}{' '}
                      <span className="font-mono text-slate-700">
                        {evidence.value || INSUFFICIENT_LABEL}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">{item.exception_reasons[flag]}</p>

                  {/* 규격 변경은 기존값과 변경값을 나란히 보여준다 */}
                  {flag === 'spec_mismatch' && item.spec_change && (
                    <div className="mt-2 flex items-center gap-3 text-sm">
                      <Box label="기존" value={item.spec_change.old} />
                      <span className="text-slate-400">→</span>
                      <Box label="변경" value={item.spec_change.new} tone="amber" />
                    </div>
                  )}

                  {/* 중복은 기준 항목으로 이동할 수 있게 한다 */}
                  {flag === 'duplicate_suspected' && item.duplicate_of && (
                    <button
                      type="button"
                      onClick={() => onSelect(item.duplicate_of!)}
                      className="mt-2 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      기준 항목 {item.duplicate_of_doc_id} 보기 →
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 중복 그룹의 기준 항목 쪽 안내 */}
      {item.duplicate_members.length > 0 && (
        <div className="rounded-lg border border-pink-200 bg-pink-50 p-3">
          <p className="text-sm text-pink-900">
            이 항목과 같은 내용으로 의심되는 건이 {item.duplicate_members.length}건 있습니다.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.duplicate_members.map((m) => (
              <button
                key={m.uid}
                type="button"
                onClick={() => onSelect(m.uid)}
                className="rounded-md border border-pink-300 bg-white px-2.5 py-1 text-xs text-pink-900 hover:bg-pink-100"
              >
                {m.doc_id} 보기 →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 관찰값과 수정값을 분리해서 나란히 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-navy">항목 값</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          관찰값은 파일에서 읽은 원본이며 바뀌지 않습니다. 수정값은 사람이 고칠 수 있는 현재 값입니다.
        </p>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="w-32 py-1.5 font-medium">필드</th>
              <th className="py-1.5 font-medium">관찰값 (원본)</th>
              <th className="py-1.5 font-medium">수정값 (현재)</th>
            </tr>
          </thead>
          <tbody>
            {OBSERVED_FIELDS.map((field) => {
              const before = item.observed[field];
              const after = item.current[field];
              const changed = before !== after;
              return (
                <tr key={field} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 text-xs text-slate-500">{FIELD_LABEL[field]}</td>
                  <td className="border-r border-slate-100 py-1.5 pr-3 font-mono text-xs text-slate-600">
                    {before || <Empty />}
                  </td>
                  <td className="py-1 pl-3">
                    <EditableValue
                      uid={item.uid}
                      field={field}
                      value={after}
                      changed={changed}
                      onCommit={actions.editField}
                    />
                  </td>
                </tr>
              );
            })}
            {/* 정규화 품목명은 입력에 없고 산출되는 값이라 따로 표시한다 */}
            <tr>
              <td className="py-1.5 pr-2 text-xs text-slate-500">{FIELD_LABEL.normalized_item_name}</td>
              <td className="border-r border-slate-100 py-1.5 pr-3 text-xs text-slate-400">산출 필드 (입력에 없음)</td>
              <td className="py-1 pl-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <EditableValue
                    uid={item.uid}
                    field="normalized_item_name"
                    value={item.current.normalized_item_name}
                    changed={false}
                    placeholder={INSUFFICIENT_LABEL}
                    onCommit={actions.editField}
                  />
                  <span className="shrink-0 rounded border border-slate-300 bg-slate-50 px-1 py-0.5 text-[10px] text-slate-500">
                    {NORMALIZATION_SOURCE_LABEL[item.normalization.source]}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ReviewActions
        item={item}
        onApprove={actions.approve}
        onReject={actions.reject}
        onReopen={actions.reopen}
        onToggleDuplicate={actions.toggleDuplicateDismissed}
        onMemo={actions.setMemo}
      />

      <ChangeLogPanel item={item} />
    </section>
  );
}

/**
 * 수정값 입력칸.
 *
 * key에 현재 값을 넣어 값이 바뀌면 새로 마운트되게 했다. 이렇게 하면
 * effect로 상태를 되돌릴 필요가 없어 입력 도중 값이 튀지 않는다.
 * 커밋은 포커스가 빠질 때, 엔터를 누르면 포커스를 빼서 같은 경로를 탄다.
 */
function EditableValue({
  uid, field, value, changed, placeholder, onCommit,
}: {
  uid: string;
  field: keyof CurrentFields;
  value: string;
  changed: boolean;
  placeholder?: string;
  onCommit: (uid: string, field: keyof CurrentFields, value: string) => void;
}) {
  return (
    <div className="flex w-full items-center gap-1">
      <input
        key={`${uid}:${field}:${value}`}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => onCommit(uid, field, e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.currentTarget.value = value;
            e.currentTarget.blur();
          }
        }}
        className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs outline-none hover:border-slate-300 focus:border-navy focus:bg-white ${
          changed ? 'font-semibold text-emerald-700' : 'text-slate-800'
        } ${value === '' ? 'placeholder:text-amber-600' : ''}`}
      />
      {changed && <span className="shrink-0 text-[10px] text-emerald-600">수정됨</span>}
    </div>
  );
}

function Box({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'amber' }) {
  const style = tone === 'amber'
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : 'border-slate-300 bg-white text-slate-700';
  return (
    <div className={`rounded-md border px-2.5 py-1 ${style}`}>
      <div className="text-[10px] opacity-70">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

/** 요건 3: "필드 누락은 데이터 부족으로 표시". 빈칸으로 두지 않는다. */
const Empty = () => (
  <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-sans text-amber-900">
    {INSUFFICIENT_LABEL}
  </span>
);
