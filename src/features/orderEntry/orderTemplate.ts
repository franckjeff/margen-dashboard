import { SIZES } from "../../lib/constants";

// What the public Order Entry page knows about an item: no more than its name and code.
export type EntryItem = { id: string; item_code: string; name: string };
export type EntryLine = { item_id: string; size: string; quantity: number };

export const MAX_QUANTITY = 99999;

// The client order template: one row per item, one column per size, quantities in the cells.
export const TEMPLATE_COLUMNS: [string, number][] = [["Item", 28], ...SIZES.map((s): [string, number] => [s, 6])];
export const templateRows = (items: EntryItem[]) => items.map((i) => [i.name, ...SIZES.map(() => null)]);

const squash = (text: unknown) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Size headings as clients may write them: "xl", "XXL" for 2XL, "Size 10".
const SIZE_ALIASES: Record<string, string> = { xxl: "2XL", xxxl: "3XL" };
const sizeOf = (heading: string) => {
  const key = squash(heading).replace(/^size/, "");
  return SIZE_ALIASES[key] ?? SIZES.find((s) => s.toLowerCase() === key);
};

// Reads a filled-in template (rows of cell text, as readFirstSheet returns them) into order lines.
// Problems are listed per row, so the client can fix the file; a file that isn't the template throws.
export function linesFromSheet(table: string[][], items: EntryItem[]): { lines: EntryLine[]; errors: string[] } {
  const headingRow = table.findIndex((row) => row.some((cell) => squash(cell) === "item"));
  const headings = table[headingRow] ?? [];
  const itemColumn = headings.findIndex((cell) => squash(cell) === "item");
  const sizeColumns = headings.flatMap((cell, index) => {
    const size = sizeOf(cell);
    return size ? [{ index, size }] : [];
  });
  if (itemColumn < 0 || !sizeColumns.length) {
    throw new Error("This file isn't the MARGEN order template: it needs an Item column and a column for each size. Download the template and fill it in.");
  }

  const lines: EntryLine[] = [];
  const errors: string[] = [];
  table.slice(headingRow + 1).forEach((cells, index) => {
    const row = headingRow + index + 2; // the spreadsheet's own row number
    const name = String(cells[itemColumn] ?? "").trim();
    const filled = sizeColumns.filter(({ index: column }) => String(cells[column] ?? "").trim() !== "");
    if (!filled.length) return;
    const item = items.find((i) => squash(i.name) === squash(name) || squash(i.item_code) === squash(name));
    if (!item) {
      errors.push(name ? `Row ${row}: "${name}" isn't one of our items.` : `Row ${row}: quantities without an item name.`);
      return;
    }
    for (const { index: column, size } of filled) {
      const text = String(cells[column]).trim();
      const quantity = Number(text);
      if (quantity === 0) continue;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        errors.push(`Row ${row}, size ${size}: "${text}" isn't a whole number from 1 to ${MAX_QUANTITY}.`);
      } else {
        lines.push({ item_id: item.id, size, quantity });
      }
    }
  });
  if (!lines.length && !errors.length) errors.push("No quantities are filled in.");
  return { lines, errors };
}

// Adds lines to a list; the same item and size is kept once, with the quantities added up.
export function mergeLines(current: EntryLine[], added: EntryLine[]): EntryLine[] {
  const merged = current.map((l) => ({ ...l }));
  for (const line of added) {
    const same = merged.find((l) => l.item_id === line.item_id && l.size === line.size);
    if (same) same.quantity += line.quantity;
    else merged.push({ ...line });
  }
  return merged;
}
