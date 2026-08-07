'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseEvidenceCsv, CsvParseError } from './parseCsv';
import { buildItems, effectiveFlags } from './pipeline';
import type { ExceptionFlag, Item, ReviewStatus } from './types';

/**
 * 화면 상태 5종. 요건에 명시된 loading·empty·no-results·error·success에 대응한다.
 * empty와 no-results는 items·filtered 길이에서 파생되므로 여기서는 원인 상태만 들고 있는다.
 */
export type LoadState = 'idle' | 'loading' | 'error' | 'success';

export interface Filters {
  status: ReviewStatus | 'all';
  flag: ExceptionFlag | 'all';
}

/** 인박스 상태 전체. 복원과 저장이 원자적으로 일어나도록 한 덩어리로 둔다. */
interface InboxData {
  items: Item[];
  fileName: string | null;
  warnings: string[];
  filters: Filters;
  selectedId: string | null;
  loadState: LoadState;
  errorMessage: string;
}

const STORAGE_KEY = 'hwaiting-guri.inbox.v1';
const DEFAULT_FILTERS: Filters = { status: 'all', flag: 'all' };

const EMPTY: InboxData = {
  items: [],
  fileName: null,
  warnings: [],
  filters: DEFAULT_FILTERS,
  selectedId: null,
  loadState: 'idle',
  errorMessage: '',
};

/** 저장 대상. loadState와 errorMessage는 다시 계산되므로 저장하지 않는다. */
type Persisted = Omit<InboxData, 'loadState' | 'errorMessage'>;

function readBackup(): InboxData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Persisted;
    if (!Array.isArray(saved.items) || saved.items.length === 0) return null;
    return {
      items: saved.items,
      fileName: saved.fileName ?? null,
      warnings: saved.warnings ?? [],
      filters: saved.filters ?? DEFAULT_FILTERS,
      selectedId: saved.selectedId ?? null,
      loadState: 'success',
      errorMessage: '',
    };
  } catch {
    // 백업이 깨졌으면 무시하고 빈 상태로 시작한다. 원본은 파일에 있다.
    return null;
  }
}

/**
 * 검수 인박스 상태.
 *
 * 서버에 상태를 두지 않는다. 요건상 영구 감사 로그와 회원 권한이 불필요하고,
 * 심사 시 여러 명이 각자 접속해도 서로 간섭하지 않아야 하기 때문이다.
 * 실수로 새로고침해도 세션이 날아가지 않도록 localStorage에 백업한다.
 */
export function useInbox() {
  const [data, setData] = useState<InboxData>(EMPTY);
  const restored = useRef(false);

  // localStorage는 서버 렌더 시점에 없다. 초기값으로 읽으면 하이드레이션이 어긋나므로
  // 마운트 직후 한 번만 복원한다. 상태를 한 덩어리로 합쳐 setState 호출도 한 번이다.
  useEffect(() => {
    const backup = readBackup();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라이언트 전용이라 마운트 후에만 읽을 수 있다
    if (backup) setData(backup);
    restored.current = true;
  }, []);

  // 이전 필터와 선택 항목까지 저장해야 새로고침 후 "복귀 경로" 요건을 만족한다.
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (data.items.length === 0) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const payload: Persisted = {
        items: data.items,
        fileName: data.fileName,
        warnings: data.warnings,
        filters: data.filters,
        selectedId: data.selectedId,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 용량 초과 등으로 백업에 실패해도 화면 동작은 막지 않는다.
    }
  }, [data]);

  const load = useCallback(async (file: File) => {
    setData((prev) => ({ ...prev, loadState: 'loading', errorMessage: '' }));
    try {
      const text = await file.text();
      const parsed = parseEvidenceCsv(text);
      const items = buildItems(parsed.rows, file.name);
      setData({
        items,
        fileName: file.name,
        warnings: parsed.warnings,
        filters: DEFAULT_FILTERS,
        selectedId: items[0]?.doc_id ?? null,
        loadState: 'success',
        errorMessage: '',
      });
    } catch (error) {
      // 읽기에 실패해도 이미 검수 중이던 목록은 지우지 않는다.
      // 잘못된 파일 하나 때문에 진행하던 작업이 날아가면 안 된다.
      setData((prev) => ({
        ...prev,
        loadState: 'error',
        errorMessage:
          error instanceof CsvParseError
            ? error.message
            : `파일을 읽지 못했습니다. ${error instanceof Error ? error.message : ''}`,
      }));
    }
  }, []);

  const reset = useCallback(() => setData(EMPTY), []);

  const setFilters = useCallback(
    (filters: Filters) => setData((prev) => ({ ...prev, filters })),
    [],
  );
  const setSelectedId = useCallback(
    (selectedId: string | null) => setData((prev) => ({ ...prev, selectedId })),
    [],
  );

  const filtered = useMemo(
    () =>
      data.items.filter((item) => {
        if (data.filters.status !== 'all' && item.review_status !== data.filters.status) return false;
        if (data.filters.flag !== 'all' && !effectiveFlags(item).includes(data.filters.flag)) return false;
        return true;
      }),
    [data.items, data.filters],
  );

  const counts = useMemo(() => {
    const byStatus = {} as Record<ReviewStatus, number>;
    const byFlag = {} as Record<ExceptionFlag, number>;
    let exception = 0;
    for (const item of data.items) {
      byStatus[item.review_status] = (byStatus[item.review_status] ?? 0) + 1;
      const flags = effectiveFlags(item);
      if (flags.length > 0) exception += 1;
      for (const flag of flags) byFlag[flag] = (byFlag[flag] ?? 0) + 1;
    }
    return { byStatus, byFlag, total: data.items.length, exception };
  }, [data.items]);

  const selected = useMemo(
    () => data.items.find((i) => i.doc_id === data.selectedId) ?? null,
    [data.items, data.selectedId],
  );

  return {
    items: data.items,
    fileName: data.fileName,
    warnings: data.warnings,
    loadState: data.loadState,
    errorMessage: data.errorMessage,
    filters: data.filters,
    selectedId: data.selectedId,
    filtered, counts, selected,
    setFilters, setSelectedId, load, reset,
  };
}
