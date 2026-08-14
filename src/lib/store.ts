'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseEvidenceCsv, CsvParseError } from './parseCsv';
import { addManualItem, addPdfItems, buildItems, effectiveFlags, recomputeItems, restoreItems } from './pipeline';
import * as review from './review';
import { SAMPLE_CSV, SAMPLE_FILE_NAME } from './sampleData';
import type { CurrentFields, ExceptionFlag, Item, ReviewStatus } from './types';

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
  /** 선택된 항목의 uid. 문서ID는 재업로드로 중복되므로 쓰지 않는다 */
  selectedId: string | null;
  loadState: LoadState;
  errorMessage: string;
  /** 지금까지 인입한 횟수 */
  batchCount: number;
  /** 인입한 파일의 내용 해시 목록. 같은 파일 재업로드 안내에 쓴다 */
  fileHashes: string[];
  /** 직전 인입 결과 요약. 누적 인입이라 몇 건이 새로 들어왔는지 알려준다 */
  lastIntake: { batchNo: number; added: number; duplicates: number } | null;
}

/**
 * 항목 구조가 바뀌면 버전을 올린다. 예전 백업은 무시하고 빈 상태로 시작한다.
 * v3에서 format_errors가 추가됐다. v2 백업을 그대로 복원하면 이 필드가 없어
 * 상태 계산이 깨지므로 키를 바꿔 읽지 않게 한다.
 */
const STORAGE_KEY = 'hwaiting-guri.inbox.v3';

/**
 * 같은 파일을 두 번 올렸는지 알아보기 위한 내용 해시.
 * 파일 단위 차단용이 아니라 "이미 올린 파일입니다" 안내를 띄우는 용도다.
 * 한 행만 고쳐 재송부된 파일은 해시가 달라지므로, 중복 탐지는 어차피 행 단위로 돈다.
 */
function contentHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const DEFAULT_FILTERS: Filters = { status: 'all', flag: 'all' };

const EMPTY: InboxData = {
  items: [],
  fileName: null,
  warnings: [],
  filters: DEFAULT_FILTERS,
  selectedId: null,
  loadState: 'idle',
  errorMessage: '',
  batchCount: 0,
  fileHashes: [],
  lastIntake: null,
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
      // 나중에 추가한 필드는 예전 백업에 없다. 판정에 영향이 없는 값은 채워 넣어
      // 검수하던 승인·메모를 살린다.
      items: restoreItems(saved.items),
      fileName: saved.fileName ?? null,
      warnings: saved.warnings ?? [],
      filters: saved.filters ?? DEFAULT_FILTERS,
      selectedId: saved.selectedId ?? null,
      loadState: 'success',
      errorMessage: '',
      batchCount: saved.batchCount ?? 1,
      fileHashes: saved.fileHashes ?? [],
      lastIntake: saved.lastIntake ?? null,
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
  /** 이미 올린 파일을 또 올렸을 때 확인을 받으려고 잠시 들고 있는 내용 */
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string } | null>(null);
  /** load 안에서 최신 해시 목록을 읽어야 해서 ref로도 들고 있는다 */
  const hashesRef = useRef<string[]>([]);
  hashesRef.current = data.fileHashes;

  // localStorage는 서버 렌더 시점에 없다. 초기값으로 읽으면 하이드레이션이 어긋나므로
  // 마운트 직후 한 번만 복원한다. 상태를 한 덩어리로 합쳐 setState 호출도 한 번이다.
  useEffect(() => {
    // localStorage는 클라이언트 전용이라 마운트 후에만 읽을 수 있다.
    const backup = readBackup();
    if (backup) setData(backup);
    restored.current = true;
  }, []);

  // 이전 필터와 선택 항목까지 저장해야 새로고침 후 "복귀 경로" 요건을 만족한다.
  //
  // 목록이 비었을 때 백업을 지우지 않는다. 화면이 어떤 이유로든 빈 상태로
  // 다시 뜨면(렌더 중 오류, 복원 직전의 첫 렌더) 그 순간 백업이 지워져
  // 검수하던 내용이 통째로 날아가기 때문이다. 삭제는 사람이 "비우기"를
  // 눌렀을 때 reset이 직접 한다.
  useEffect(() => {
    if (!restored.current || data.items.length === 0) return;
    try {
      const payload: Persisted = {
        items: data.items,
        fileName: data.fileName,
        warnings: data.warnings,
        filters: data.filters,
        selectedId: data.selectedId,
        batchCount: data.batchCount,
        fileHashes: data.fileHashes,
        lastIntake: data.lastIntake,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 용량 초과 등으로 백업에 실패해도 화면 동작은 막지 않는다.
    }
  }, [data]);

  /** 파싱된 내용을 실제로 인입한다. 확인 절차를 거친 뒤 호출된다. */
  const commit = useCallback((name: string, text: string) => {
    try {
      const parsed = parseEvidenceCsv(text);
      const hash = contentHash(text);

      setData((prev) => {
        const batchNo = prev.batchCount + 1;
        const items = buildItems(parsed.rows, name, prev.items, {
          batchNo,
          startSeq: prev.items.length,
        });
        const incoming = items.slice(prev.items.length);
        const duplicates = incoming.filter((i) =>
          i.exception_flags.includes('duplicate_suspected'),
        ).length;

        return {
          ...prev,
          items,
          fileName: name,
          warnings: parsed.warnings,
          filters: DEFAULT_FILTERS,
          selectedId: incoming[0]?.uid ?? prev.selectedId,
          loadState: 'success',
          errorMessage: '',
          batchCount: batchNo,
          fileHashes: [...prev.fileHashes, hash],
          lastIntake: { batchNo, added: incoming.length, duplicates },
        };
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

  /**
   * 파일을 읽어 **기존 목록 뒤에 이어 붙인다**. 덮어쓰지 않는다.
   *
   * 같은 파일을 다시 올리면 두 번째 인입분이 전부 중복 의심으로 잡힌다.
   * 담당자가 실수로 두 번 올리거나 공급사가 재발송했을 때 같은 인상분이
   * 두 번 반영되는 사고를 잡는 것이 이 기능의 목적이다.
   *
   * 이미 올린 것과 내용이 같은 파일이면 바로 넣지 않고 먼저 확인을 받는다.
   * 조용히 무시하지도, 조용히 넣지도 않는다.
   */
  const load = useCallback(
    async (file: File) => {
      setData((prev) => ({ ...prev, loadState: 'loading', errorMessage: '' }));
      const text = await file.text();

      if (hashesRef.current.includes(contentHash(text))) {
        setPendingFile({ name: file.name, text });
        setData((prev) => ({ ...prev, loadState: 'success' }));
        return;
      }
      commit(file.name, text);
    },
    [commit],
  );

  /**
   * 내장한 예시 데이터를 넣는다.
   *
   * 파일 선택과 완전히 같은 경로다. 문자열을 파서에 넣고 commit을 태우므로
   * 판정은 실행 시점에 데이터에서 계산된다. 결과를 미리 넣어 두지 않는다.
   */
  const loadSample = useCallback(() => {
    commit(SAMPLE_FILE_NAME, SAMPLE_CSV);
  }, [commit]);

  /**
   * 화면에서 직접 등록한다. 파일 인입과 같은 파이프라인을 탄다.
   * 인입 횟수(batchCount)도 함께 올려, 기존 항목과 다른 배치로 구분되게 한다.
   */
  const addManual = useCallback((values: Record<string, string>) => {
    setData((prev) => {
      const batchNo = prev.batchCount + 1;
      const items = addManualItem(values, prev.items, batchNo);
      const added = items[items.length - 1];
      return {
        ...prev,
        items,
        // 파일에서 온 게 아니므로 파일명 표시는 건드리지 않는다.
        selectedId: added.uid,
        loadState: 'success',
        errorMessage: '',
        batchCount: batchNo,
        lastIntake: {
          batchNo,
          added: 1,
          duplicates: added.exception_flags.includes('duplicate_suspected') ? 1 : 0,
        },
      };
    });
  }, []);

  /**
   * PDF에서 읽어 사람이 확인한 여러 건을 한 번에 넣는다.
   *
   * 파일·수기 등록과 같은 파이프라인을 탄다. 읽어 온 값이라고 판정을 건너뛰면
   * PDF로 들어온 건만 중복 검사가 빠지는 구멍이 생긴다.
   * 출처는 PDF 파일명과 쪽 번호로 남겨, 나중에 원본 공문을 되짚을 수 있게 한다.
   */
  const addExtracted = useCallback((
    rows: { values: Record<string, string>; pageNo: number }[],
    fileName: string,
  ) => {
    if (rows.length === 0) return;
    setData((prev) => {
      const batchNo = prev.batchCount + 1;
      const items = addPdfItems(rows, fileName, prev.items, batchNo);
      const incoming = items.slice(prev.items.length);
      return {
        ...prev,
        items,
        selectedId: incoming[0]?.uid ?? prev.selectedId,
        loadState: 'success',
        errorMessage: '',
        batchCount: batchNo,
        lastIntake: {
          batchNo,
          added: incoming.length,
          duplicates: incoming.filter((i) => i.exception_flags.includes('duplicate_suspected')).length,
        },
      };
    });
  }, []);

  /** 같은 파일 확인 안내에서 계속 진행을 고른 경우 */
  const confirmPendingFile = useCallback(() => {
    if (!pendingFile) return;
    commit(pendingFile.name, pendingFile.text);
    setPendingFile(null);
  }, [pendingFile, commit]);

  const cancelPendingFile = useCallback(() => setPendingFile(null), []);

  /** 비우기. 백업 삭제는 사람이 이 버튼을 눌렀을 때만 일어난다. */
  const reset = useCallback(() => {
    setPendingFile(null);
    setData(EMPTY);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 백업을 못 지워도 화면 상태는 이미 비워졌다.
    }
  }, []);

  const setFilters = useCallback(
    (filters: Filters) => setData((prev) => ({ ...prev, filters })),
    [],
  );
  const setSelectedId = useCallback(
    (selectedId: string | null) => setData((prev) => ({ ...prev, selectedId })),
    [],
  );

  /**
   * 항목 하나를 바꾸고 목록 전체를 다시 계산한다.
   * 값이 바뀌면 예외 판정과 중복 그룹이 함께 달라지기 때문이다.
   */
  const updateItem = useCallback(
    (uid: string, fn: (item: Item, at: string) => Item) => {
      const at = new Date().toISOString();
      setData((prev) => ({
        ...prev,
        items: recomputeItems(
          prev.items.map((item) => (item.uid === uid ? fn(item, at) : item)),
          at,
        ),
      }));
    },
    [],
  );

  const actions = useMemo(
    () => ({
      editField: (uid: string, field: keyof CurrentFields, value: string) =>
        updateItem(uid, (item, at) => review.editField(item, field, value, at)),
      approve: (uid: string) => updateItem(uid, review.approve),
      reject: (uid: string) => updateItem(uid, review.reject),
      reopen: (uid: string) => updateItem(uid, review.reopen),
      toggleDuplicateDismissed: (uid: string) =>
        updateItem(uid, review.toggleDuplicateDismissed),
      setMemo: (uid: string, memo: string) =>
        updateItem(uid, (item) => review.setMemo(item, memo)),
    }),
    [updateItem],
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
      // 형식 오류만 있는 항목도 사람이 봐야 하는 건이다.
      // 예외 플래그만 세면 상단 요약과 목록 상태가 어긋난다.
      if (flags.length > 0 || item.format_errors.length > 0) exception += 1;
      for (const flag of flags) byFlag[flag] = (byFlag[flag] ?? 0) + 1;
    }
    return { byStatus, byFlag, total: data.items.length, exception };
  }, [data.items]);

  const selected = useMemo(
    () => data.items.find((i) => i.uid === data.selectedId) ?? null,
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
    setFilters, setSelectedId, load, reset, addManual, addExtracted, loadSample,
    pendingFile, confirmPendingFile, cancelPendingFile,
    lastIntake: data.lastIntake, batchCount: data.batchCount,
    ...actions,
  };
}
