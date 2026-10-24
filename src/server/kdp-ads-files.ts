import "server-only";

import ExcelJS from "exceljs";

import { parseCsv } from "@/lib/kdp-ads";

export const MAX_REPORT_BYTES = 8 * 1024 * 1024;

/** Cells of the first sheet (xlsx) or of the CSV, header row first. */
export async function readReportTable(file: File): Promise<unknown[][] | { error: string }> {
  if (file.size > MAX_REPORT_BYTES) return { error: "Il file supera gli 8 MB." };
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
    } catch {
      return { error: "Il file Excel non si legge." };
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) return { error: "Il file Excel è vuoto." };
    const table: unknown[][] = [];
    sheet.eachRow((row) => {
      const cells: unknown[] = [];
      // values is 1-based; cell objects (formulas, rich text) become their text.
      row.eachCell({ includeEmpty: true }, (cell, index) => {
        const value = cell.value;
        cells[index - 1] =
          value && typeof value === "object" && !(value instanceof Date)
            ? "result" in value
              ? value.result
              : cell.text
            : value;
      });
      table.push(cells);
    });
    return table;
  }
  // CSV, possibly with a UTF-8 BOM or UTF-16 from Excel.
  const bytes = new Uint8Array(buffer);
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
  const text = new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(buffer).replace(/^﻿/, "");
  return parseCsv(text);
}
