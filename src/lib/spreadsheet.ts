/**
 * Excel workbooks are imported as CSV text, one file per sheet, so their rows
 * can be read, edited and shared like any other snippet file. Large results go
 * through the chunked save pipeline like any other large file.
 *
 * Only cell values survive: formatting, formulas (their last computed value is
 * kept), charts and images are dropped.
 */
import { MAX_FILE_BYTES, utf8Length } from './chunked-upload';

const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xls']);

export function isSpreadsheet(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return Boolean(extension && fileName.includes('.') && SPREADSHEET_EXTENSIONS.has(extension));
}

export interface ConvertedSheet {
  /** File-name-safe sheet name, without extension. */
  name: string;
  content: string;
  /** UTF-8 size of `content`. */
  size: number;
}

/** A failure the caller handles by keeping the workbook as an ordinary file. */
export class SpreadsheetConversionError extends Error {}

/** Sheet names may hold characters that would split or break a path. */
function toFileStem(sheetName: string, index: number): string {
  const cleaned = sheetName.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim();
  return cleaned || `Sheet${index + 1}`;
}

/**
 * Converts every non-empty sheet to CSV. Returns an empty list for a workbook
 * with no data. Throws SpreadsheetConversionError when the file can't be read
 * (corrupt, password-protected) or a sheet's CSV is over the file size limit.
 */
export async function convertSpreadsheet(file: File): Promise<ConvertedSheet[]> {
  // Loaded only when a workbook is uploaded; the parser is large.
  const XLSX = await import('xlsx');

  const bytes = new Uint8Array(await file.arrayBuffer());
  /*
   * The parser guesses a format for whatever it's given and reads unknown bytes
   * as CSV, which would turn a corrupt .xlsx into a CSV of garbage. An .xlsx is
   * a zip, or an OLE container when password-protected. An .xls may
   * legitimately be HTML or CSV (common for web exports), so it isn't checked.
   */
  const startsWith = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const isZip = startsWith([0x50, 0x4b, 0x03, 0x04]);
  const isOle = startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (!/\.xls$/i.test(file.name) && !isZip && !isOle) {
    throw new SpreadsheetConversionError(`Couldn't read ${file.name} as a spreadsheet`);
  }

  let workbook: import('xlsx').WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: 'array', dense: true });
  } catch (error) {
    throw new SpreadsheetConversionError(
      error instanceof Error && /password/i.test(error.message)
        ? `${file.name} is password-protected`
        : `Couldn't read ${file.name} as a spreadsheet`,
    );
  }

  const sheets: ConvertedSheet[] = [];
  const usedStems = new Set<string>();
  workbook.SheetNames.forEach((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    // Chart sheets and similar have no cells.
    if (!sheet || !sheet['!ref']) return;

    const content = XLSX.utils.sheet_to_csv(sheet)
      // Formatting often stretches a sheet's range over rows with no values.
      .replace(/(?:\n,*)+$/, '');
    if (!content.replace(/[,\n]/g, '')) return;

    const size = utf8Length(content);
    if (size > MAX_FILE_BYTES) {
      throw new SpreadsheetConversionError(`Sheet "${sheetName}" of ${file.name} is too large to convert`);
    }

    // Sanitizing can make two names collide ("a/b" and "a-b").
    const stem = toFileStem(sheetName, index);
    let unique = stem;
    for (let counter = 2; usedStems.has(unique.toLowerCase()); counter += 1) unique = `${stem} (${counter})`;
    usedStems.add(unique.toLowerCase());

    sheets.push({ name: unique, content, size });
  });
  return sheets;
}
