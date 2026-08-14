/**
 * PDF에서 단가 표를 읽어 검수 후보를 만든다. (명세 추가 요건)
 *
 * 창업팀이 준 샘플 공문 4종은 스캔 이미지가 아니라 텍스트 레이어가 있는 PDF였다.
 * 그래서 OCR 엔진이 필요하지 않다. 진짜 과제는 글자를 읽는 것이 아니라
 * **표 구조를 되살리는 것**이다. 텍스트만 뽑으면 이렇게 붙어 나온다.
 *
 *   품목  규격  단위  기존단가  변경단가  적용일자
 *   건표고버섯500g/PKPK18,40020,2002026-09-01
 *
 * pdf.js는 글자 조각마다 위치를 함께 주므로, y좌표로 행을 묶고 x좌표로 열을 갈라
 * 표를 복원한다.
 *
 * 명세는 이 요건에 "정확도 목표 없음, 실패 사례와 미지원 형식 기록"을 달아 두었다.
 * 모든 PDF를 읽는 것이 목표가 아니라 가능성을 확인하고 한계를 남기는 것이 목표다.
 */

/** 글자 조각 하나. pdf.js TextItem에서 필요한 것만 추린다. */
interface Piece {
  text: string;
  x: number;
  y: number;
  width: number;
  /**
   * 공백만 있는 조각인지.
   *
   * pdf.js는 칸 사이 여백도 조각으로 준다. 이 조각의 폭이 곧 눈에 보이는 간격이라
   * 셀을 가를 때 쓴다. 버리고 좌표만 빼면 자간과 열 경계를 구분할 수 없다.
   */
  isSpace: boolean;
}

/** 복원한 표의 한 행 */
export interface ExtractedRow {
  /** 헤더에서 알아낸 컬럼명 -> 값 */
  values: Record<string, string>;
  /** 몇 쪽에서 나왔는지. 1부터 */
  page: number;
}

export interface ExtractResult {
  rows: ExtractedRow[];
  /** 읽지 못한 이유. 화면에 그대로 보여준다 */
  problems: string[];
  /** 표에서 찾은 컬럼 이름들 */
  headers: string[];
  pageCount: number;
  /** 문서 전체에서 글자를 하나도 못 찾았는가 (스캔 이미지 PDF) */
  looksScanned: boolean;
}

/**
 * 공문마다 표 머리글이 다르다. 우리 9개 필드로 옮기기 위한 사전이다.
 * 여백이 섞여 들어오는 경우가 있어 공백을 지우고 비교한다.
 */
const HEADER_ALIASES: Record<string, string> = {
  '품목': '원문 품목명', '품목명': '원문 품목명', '품명': '원문 품목명',
  '규격': '규격', '규격기존변경': '규격',
  '단위': '단위',
  '기존단가': '기존단가(원)', '기존단가원': '기존단가(원)', '종전단가': '기존단가(원)',
  '변경단가': '변경단가(원)', '변경단가원': '변경단가(원)', '조정단가': '변경단가(원)',
  '적용일': '적용일', '적용일자': '적용일', '시행일': '적용일',
};

/** 우리가 쓰지 않는 열. 표에는 있지만 9개 필드에 없다 */
const IGNORED_HEADERS = new Set(['번호', 'No', '연번', '인상률', '비고']);

function normalizeHeader(text: string): string {
  return text.replace(/[\s()（）]/g, '');
}

/**
 * pdf.js로 글자 조각과 위치를 읽는다.
 *
 * 라이브러리를 화면이 뜰 때가 아니라 이 함수를 부를 때 불러온다.
 * PDF를 쓰지 않는 사람에게까지 무거운 파일을 내려받게 할 이유가 없고,
 * 서버 렌더 시점에는 브라우저 API가 없어 정적 생성이 깨진다.
 */
async function readPieces(file: File): Promise<{ pages: Piece[][]; pageCount: number }> {
  // 브라우저에서는 기본 빌드를, Node에서는 legacy 빌드를 써야 한다.
  // 자체 테스트가 같은 코드를 Node에서 돌리는데, 기본 빌드는 그곳에서
  // 경고만 남기고 문서를 열지 못한다.
  const inBrowser = typeof window !== 'undefined';
  const pdfjs = inBrowser
    ? await import('pdfjs-dist')
    : await import('pdfjs-dist/legacy/build/pdf.mjs');

  if (inBrowser) {
    // 워커 파일을 번들러가 찾을 수 있는 형태로 지정한다(pdf.js 권장 방식).
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).toString();
  }

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: Piece[][] = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pieces: Piece[] = [];

    for (const item of content.items) {
      if (!('str' in item)) continue;
      // 폭이 0인 빈 조각만 버린다. 공백 조각은 칸을 가르는 데 필요하다.
      if (item.str === '') continue;
      // transform은 6요소 행렬이고 4·5번이 x·y다(PDF 9.4.4 텍스트 렌더링 행렬).
      pieces.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        isSpace: item.str.trim() === '',
      });
    }
    pages.push(pieces);
  }

  return { pages, pageCount: doc.numPages };
}

/**
 * 같은 줄에 있는 글자끼리 묶는다.
 *
 * y가 정확히 같은 경우는 드물다. 글꼴이 섞이면 몇 픽셀씩 어긋나므로
 * 허용 범위를 두고 묶은 뒤 x 순으로 정렬한다.
 */
function groupIntoLines(pieces: Piece[], tolerance = 3): Piece[][] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Piece[][] = [];

  for (const piece of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].y - piece.y) <= tolerance) line.push(piece);
    else lines.push([piece]);
  }

  // 공백 조각은 칸을 가르는 데만 쓰고 줄 자체에는 남겨 둔다. 병합은 머리글에서만 한다.
  return lines.map((line) => [...line].sort((a, b) => a.x - b.x));
}

/**
 * 머리글 한 줄에서 칸에 속한 조각들을 합친다.
 *
 * 공문 표의 머리글은 자간을 넓혀 쓰는 일이 많아 `품 목`이 "품"·" "·"목" 세 조각으로
 * 들어온다. 이대로 두면 어느 쪽도 아는 컬럼명과 맞지 않아 품목 열을 통째로 놓친다.
 *
 * 가르는 기준은 **공백 조각의 폭**이다. 그것이 눈에 보이는 간격이기 때문이다.
 * 좁으면 같은 칸의 자간이고, 넓으면 열과 열 사이다. 실제 공문에서 자간은 11pt 안팎,
 * 열 사이는 37pt 이상으로 뚜렷하게 갈렸다.
 *
 * **데이터 행에는 쓰지 않는다.** 값끼리는 열 배정이 좌표로 이미 갈라 주는데,
 * 여기서 미리 붙이면 `33,600`과 `2026-08-01`이 한 칸으로 뭉쳐 버린다.
 */
function mergeAdjacent(line: Piece[], maxLetterSpacing = 20): Piece[] {
  const merged: Piece[] = [];
  let startNewCell = false;

  for (const piece of line) {
    if (piece.isSpace) {
      if (piece.width > maxLetterSpacing) startNewCell = true;
      continue;
    }

    const last = merged.at(-1);
    if (last && !startNewCell) {
      last.text += piece.text;
      last.width = piece.x + piece.width - last.x;
    } else {
      merged.push({ ...piece });
    }
    startNewCell = false;
  }

  return merged;
}

/** 열 하나. center는 글자 덩어리의 가운데 x다. */
interface Column {
  name: string;
  center: number;
}

/** 표 머리글로 보이는 줄을 찾는다. 아는 컬럼명이 3개 이상 모여 있으면 머리글로 본다. */
function findHeaderLine(lines: Piece[][]): { index: number; columns: Column[] } | null {
  for (let i = 0; i < lines.length; i += 1) {
    const columns: Column[] = [];

    for (const piece of mergeAdjacent(lines[i])) {
      const key = normalizeHeader(piece.text);
      const center = piece.x + piece.width / 2;

      if (IGNORED_HEADERS.has(piece.text) || IGNORED_HEADERS.has(key)) {
        // 우리 필드에 없는 열도 위치는 기록해야 옆 칸 값이 밀려 들어오지 않는다
        columns.push({ name: '', center });
        continue;
      }
      const mapped = HEADER_ALIASES[key];
      if (mapped) columns.push({ name: mapped, center });
    }

    const named = columns.filter((c) => c.name !== '');
    if (named.length >= 3) return { index: i, columns };
  }
  return null;
}

/**
 * 글자 조각을 열에 배정한다.
 *
 * **시작 위치가 아니라 가운데를 견준다.** 머리글은 칸 가운데에, 값은 왼쪽에 붙여
 * 찍는 표가 흔해서, 시작 x끼리 비교하면 값이 왼쪽 열로 밀려 들어간다.
 * 실제로 `냉동 다진마늘`(x 82.9)이 `품목명`(x 126.1)보다 `번호`(x 50.0)에 가까워
 * 품목 열이 통째로 비는 일이 있었다.
 *
 * 표가 반듯하지 않으면 여전히 어긋날 수 있어 한계를 README에 적어 두었다.
 */
function assignToColumns(line: Piece[], columns: Column[]): Record<string, string> {
  const cells = line.filter((p) => !p.isSpace);
  const buckets = new Map<number, string[]>();

  if (cells.length === columns.length) {
    // 칸 수가 머리글 수와 같으면 왼쪽부터 순서대로 짝지운다.
    //
    // 좌표만으로는 짧은 값이 왼쪽 열로 밀려 들어간다. 머리글은 칸 가운데,
    // 값은 왼쪽에 붙이는 표에서 `양파 중`(가운데 101)이 `품목명`(가운데 143)보다
    // `번호`(가운데 61)에 가까워 품목이 통째로 비는 일이 있었다.
    // 표는 열 수가 정해져 있으므로, 수가 맞을 때는 순서가 좌표보다 정확하다.
    cells.forEach((piece, index) => buckets.set(index, [piece.text]));
  } else {
    // 빈 칸이 있어 수가 어긋나면 좌표로 맞춘다. 가운데끼리 견준다.
    for (const piece of cells) {
      const center = piece.x + piece.width / 2;
      let best = 0;
      let bestDistance = Infinity;

      for (let c = 0; c < columns.length; c += 1) {
        const distance = Math.abs(columns[c].center - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = c;
        }
      }

      const bucket = buckets.get(best);
      if (bucket) bucket.push(piece.text);
      else buckets.set(best, [piece.text]);
    }
  }

  const values: Record<string, string> = {};
  for (const [index, texts] of buckets) {
    const name = columns[index]?.name;
    if (!name) continue;
    // 한 칸 안에서 글자가 여러 조각으로 쪼개져 있으면 이어 붙인다
    values[name] = (values[name] ? `${values[name]} ` : '') + texts.join('');
  }
  return values;
}

/** 숫자 칸에서 천단위 콤마와 "원"을 떼어 우리 형식 검증이 읽을 수 있게 한다. */
function cleanNumber(value: string): string {
  return value.replace(/[,\s]/g, '').replace(/원$/, '');
}

/**
 * PDF 한 개에서 검수 후보 행을 뽑는다.
 *
 * 표를 찾지 못해도 예외를 던지지 않는다. 무엇을 못 했는지 problems에 담아
 * 화면이 이유를 보여주게 한다.
 */
export async function extractRowsFromPdf(file: File): Promise<ExtractResult> {
  const problems: string[] = [];
  let pages: Piece[][] = [];
  let pageCount = 0;

  try {
    const read = await readPieces(file);
    pages = read.pages;
    pageCount = read.pageCount;
  } catch (error) {
    return {
      rows: [], problems: [`PDF를 열지 못했습니다. ${error instanceof Error ? error.message : ''}`],
      headers: [], pageCount: 0, looksScanned: false,
    };
  }

  const totalPieces = pages.reduce((n, p) => n + p.length, 0);
  if (totalPieces === 0) {
    return {
      rows: [],
      problems: [
        '글자를 하나도 찾지 못했습니다. 스캔한 이미지로 만들어진 PDF로 보입니다.',
        '이 경우 글자를 읽으려면 OCR이 필요하며, 이 도구는 OCR을 지원하지 않습니다.',
      ],
      headers: [], pageCount, looksScanned: true,
    };
  }

  const rows: ExtractedRow[] = [];
  let headers: string[] = [];

  for (let p = 0; p < pages.length; p += 1) {
    const lines = groupIntoLines(pages[p]);
    const header = findHeaderLine(lines);

    if (!header) {
      problems.push(`${p + 1}쪽: 단가 표의 머리글을 찾지 못했습니다.`);
      continue;
    }
    headers = header.columns.filter((c) => c.name).map((c) => c.name);

    for (let i = header.index + 1; i < lines.length; i += 1) {
      const values = assignToColumns(lines[i], header.columns);

      // 품목명과 단가가 없으면 표가 끝났거나 안내 문구 줄이다
      const item = (values['원문 품목명'] ?? '').trim();
      const before = cleanNumber(values['기존단가(원)'] ?? '');
      if (item === '' || before === '') continue;
      // 기존단가 칸은 숫자만 있어야 한다. 표 아래 연락처 줄이
      // "TEL02-0000-0000"처럼 숫자를 품고 들어오므로 숫자 포함이 아니라
      // 숫자로만 이루어졌는지를 본다.
      if (!/^\d+$/.test(before)) continue;
      // 품목 칸에 문장이 들어오면 표가 아니라 안내 문구다.
      if (item.length > 40 || /[:：]/.test(item)) continue;

      rows.push({
        page: p + 1,
        values: {
          '원문 품목명': item,
          '규격': (values['규격'] ?? '').trim(),
          '단위': (values['단위'] ?? '').trim(),
          '기존단가(원)': before,
          '변경단가(원)': cleanNumber(values['변경단가(원)'] ?? ''),
          '적용일': (values['적용일'] ?? '').trim(),
        },
      });
    }
  }

  if (rows.length === 0 && problems.length === 0) {
    problems.push('표는 찾았지만 품목 행을 읽지 못했습니다.');
  }
  // 문서ID와 공급사는 표가 아니라 문서 머리말·직인 옆에 흩어져 있어 위치가 일정하지 않다.
  // 잘못 추측해 넣는 대신 비워 두고 사람이 채우게 한다.
  if (rows.length > 0) {
    problems.push('문서ID와 공급사는 표 밖에 있어 자동으로 채우지 않았습니다. 등록 전에 입력해 주세요.');
  }

  return { rows, problems, headers, pageCount, looksScanned: false };
}
