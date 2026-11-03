// SheetJS is only downloaded when someone imports a file or downloads a spreadsheet:
// the dynamic import puts it in its own chunk, outside the app's first load.
export const loadSheetJS = () => import("xlsx");

// The first sheet of an Excel or CSV file, as rows of cell text.
export async function readFirstSheet(file: File): Promise<string[][]> {
  const XLSX = await loadSheetJS();
  const book = XLSX.read(await file.arrayBuffer());
  return XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: false, defval: "" });
}

// Saves a one-sheet workbook. columns: [heading, width in characters]; dates become real Excel dates.
export async function downloadSheet(fileName: string, sheetName: string, columns: [string, number][], rows: unknown[][]) {
  const XLSX = await loadSheetJS();
  const sheet = XLSX.utils.aoa_to_sheet([columns.map(([heading]) => heading), ...rows], { cellDates: true, dateNF: "yyyy-mm-dd" });
  sheet["!cols"] = columns.map(([, wch]) => ({ wch }));
  const book = XLSX.utils.book_new();
  // Excel limits sheet names to 31 characters.
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, fileName);
}
