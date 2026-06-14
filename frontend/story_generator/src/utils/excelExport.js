import * as XLSX from 'xlsx';

export const EXCEL_MAX_CELL_LENGTH = 32767;

export function downloadWorkbook(workbook, filename) {
  XLSX.writeFile(workbook, filename);
}

export function createWorkbookFromSheets(sheets) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  return workbook;
}

function valueToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function toExcelCellText(value) {
  const text = valueToString(value);
  if (text.length <= EXCEL_MAX_CELL_LENGTH) {
    return { text, trimmed: false };
  }
  return {
    text: text.slice(0, EXCEL_MAX_CELL_LENGTH),
    trimmed: true,
  };
}

export function jsonToCell(value) {
  return toExcelCellText(value).text;
}

export function formatExportDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
}

export function formatExportNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (value === Math.floor(value)) return value;
    return Number(value.toFixed(6));
  }
  return value;
}
