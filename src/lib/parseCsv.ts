import { REQUIRED_COLUMNS } from './types';

export interface ParsedRow {
  /** 헤더를 1행으로 세는 1-indexed 행 번호 */
  rowNo: number;
  /** 한글 컬럼명 -> 값 */
  values: Record<string, string>;
}

export interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
  /** 파싱은 됐지만 형식이 어긋난 경우. 화면에 이유와 재시도를 안내한다. */
  warnings: string[];
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/**
 * UTF-8 BOM을 제거한다.
 * 제공 파일이 UTF-8(BOM)이라 이걸 빼지 않으면 첫 컬럼명이 "﻿문서ID"가 되어
 * 컬럼 조회가 통째로 실패한다.
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * RFC 4180 기준 CSV 파서.
 * 따옴표 안의 쉼표·줄바꿈·이스케이프된 따옴표를 처리한다.
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    row.push(field);
    field = '';
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (inQuotes) {
    throw new CsvParseError('따옴표가 닫히지 않았습니다. 파일 형식을 확인해 주세요.');
  }
  // 마지막 줄에 개행이 없을 수 있다
  if (field !== '' || row.length > 0) pushRow();

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * 증빙 CSV를 읽어 행 목록으로 만든다.
 * 필수 컬럼이 하나라도 없으면 파일 단위로 거부한다. 어떤 컬럼이 없는지 알려야
 * 사용자가 다시 시도할 수 있기 때문이다.
 */
export function parseEvidenceCsv(rawText: string): ParseResult {
  const text = stripBom(rawText);
  const table = parseCsvText(text);

  if (table.length === 0) {
    throw new CsvParseError('빈 파일입니다.');
  }

  const headers = table[0].map((h) => h.trim());
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missingColumns.length > 0) {
    throw new CsvParseError(
      `필수 컬럼이 없습니다: ${missingColumns.join(', ')}\n` +
        `필요한 컬럼: ${REQUIRED_COLUMNS.join(', ')}`,
    );
  }

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];

  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r];
    const rowNo = r + 1; // 헤더가 1행

    if (cells.length !== headers.length) {
      warnings.push(
        `${rowNo}행: 컬럼 수가 ${cells.length}개로 헤더(${headers.length}개)와 다릅니다. 빈 값으로 채워 검수 대상에 올립니다.`,
      );
    }

    const values: Record<string, string> = {};
    headers.forEach((h, idx) => {
      values[h] = (cells[idx] ?? '').trim();
    });

    rows.push({ rowNo, values });
  }

  return { rows, headers, warnings };
}
