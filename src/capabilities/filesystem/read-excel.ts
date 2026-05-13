import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, statSync } from 'node:fs';
import { resolve, isAbsolute, extname } from 'node:path';
import ExcelJS from 'exceljs';
import type { PermissionManager } from '../permissions.js';

const EXCEL_EXTS = new Set(['.xlsx', '.xlsm', '.xls', '.csv']);

export function createReadExcelTool(permissions: PermissionManager, getCwd: () => string) {
  return tool({
    description:
      'Read an Excel or spreadsheet file (.xlsx, .xls, .csv). Returns sheet names and data as a markdown table or JSON. Use this when the user sends or references a spreadsheet file.',
    inputSchema: zodSchema(
      z.object({
        path: z.string().describe('Absolute or relative path to the Excel/spreadsheet file'),
        sheet: z
          .string()
          .optional()
          .describe('Sheet name or index (1-based) to read. Defaults to the first sheet.'),
        format: z
          .enum(['table', 'json'])
          .optional()
          .default('table')
          .describe('Output format: "table" (markdown) or "json" (array of objects)'),
        max_rows: z
          .number()
          .optional()
          .default(200)
          .describe('Maximum number of data rows to return (default 200)'),
      }),
    ),
    execute: async ({ path, sheet, format = 'table', max_rows = 200 }) => {
      const resolved = isAbsolute(path) ? resolve(path) : resolve(getCwd(), path);

      const check = await permissions.checkFsAccess(resolved, 'read');
      if (!check.allowed) {
        const parentDir = resolve(resolved, '..');
        return `Error: Permission denied for read access to ${resolved}. Use the approve_scope tool with path="${parentDir}" and mode="read" to request access from the user.`;
      }

      if (!existsSync(resolved)) {
        return `Error: File not found: ${resolved}`;
      }

      const ext = extname(resolved).toLowerCase();
      if (!EXCEL_EXTS.has(ext)) {
        return `Error: Unsupported file type "${ext}". Supported: ${[...EXCEL_EXTS].join(', ')}`;
      }

      const stat = statSync(resolved);
      if (stat.size > 50 * 1024 * 1024) {
        return `Error: File too large (${Math.round(stat.size / (1024 * 1024))}MB). Maximum is 50MB.`;
      }

      try {
        const workbook = new ExcelJS.Workbook();

        if (ext === '.csv') {
          await workbook.csv.readFile(resolved);
        } else {
          await workbook.xlsx.readFile(resolved);
        }

        const worksheets = workbook.worksheets;
        if (worksheets.length === 0) {
          return `Error: Workbook contains no sheets.`;
        }

        const sheetNames = worksheets.map((ws) => ws.name);

        let worksheet: ExcelJS.Worksheet = worksheets[0];
        if (sheet) {
          const found =
            workbook.getWorksheet(sheet) ?? workbook.getWorksheet(parseInt(sheet, 10));
          if (!found) {
            return `Error: Sheet "${sheet}" not found. Available sheets: ${sheetNames.join(', ')}`;
          }
          worksheet = found;
        }

        const allRows: string[][] = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          const values = (
            row.values as (ExcelJS.CellValue | null | undefined)[]
          ).slice(1);
          allRows.push(values.map((v) => formatCellValue(v)));
        });

        if (allRows.length === 0) {
          return `Sheet "${worksheet.name}" is empty.\nAvailable sheets: ${sheetNames.join(', ')}`;
        }

        const header = allRows[0];
        const dataRows = allRows.slice(1, 1 + max_rows);
        const truncated = allRows.length - 1 > max_rows;

        let output =
          `File: ${resolved}\n` +
          `Sheet: ${worksheet.name} (${allRows.length - 1} data rows)\n` +
          (sheetNames.length > 1
            ? `Other sheets: ${sheetNames.filter((n) => n !== worksheet.name).join(', ')}\n`
            : '') +
          (truncated ? `(Showing first ${max_rows} of ${allRows.length - 1} rows)\n` : '') +
          '\n';

        if (format === 'json') {
          const objects = dataRows.map((row) => {
            const obj: Record<string, string> = {};
            header.forEach((h, i) => {
              obj[h || `col_${i + 1}`] = row[i] ?? '';
            });
            return obj;
          });
          output += '```json\n' + JSON.stringify(objects, null, 2) + '\n```';
        } else {
          output += renderMarkdownTable(header, dataRows);
        }

        return output;
      } catch (err: any) {
        return `Error reading Excel file: ${err.message}`;
      }
    },
  });
}

export function createWriteExcelTool(permissions: PermissionManager, getCwd: () => string) {
  return tool({
    description:
      'Create or overwrite an Excel file (.xlsx) with provided data. Provide headers and rows as JSON arrays.',
    inputSchema: zodSchema(
      z.object({
        path: z.string().describe('Absolute or relative path to write the .xlsx file'),
        sheet_name: z.string().optional().default('Sheet1').describe('Name for the sheet'),
        headers: z.array(z.string()).describe('Column headers'),
        rows: z
          .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
          .describe('Array of row arrays, each matching the headers length'),
      }),
    ),
    execute: async ({ path, sheet_name = 'Sheet1', headers, rows }) => {
      const resolved = isAbsolute(path) ? resolve(path) : resolve(getCwd(), path);

      const check = await permissions.checkFsAccess(resolved, 'write');
      if (!check.allowed) {
        const parentDir = resolve(resolved, '..');
        return `Error: Permission denied for write access to ${resolved}. Use the approve_scope tool with path="${parentDir}" and mode="write" to request access from the user.`;
      }

      const ext = extname(resolved).toLowerCase();
      if (ext && ext !== '.xlsx') {
        return `Error: write_excel only supports .xlsx output. Got: ${ext}`;
      }

      try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheet_name);

        // Set column widths (key-only: no auto header row)
        worksheet.columns = headers.map((h, i) => ({
          key: String(i),
          width: Math.min(
            Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length), 10) + 2,
            60,
          ),
        }));

        // Header row with bold formatting
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true };

        // Data rows
        for (const row of rows) {
          worksheet.addRow(row.map((v) => v ?? ''));
        }

        await workbook.xlsx.writeFile(resolved);
        return `Excel file written: ${resolved} (${rows.length} rows, ${headers.length} columns)`;
      } catch (err: any) {
        return `Error writing Excel file: ${err.message}`;
      }
    },
  });
}

function formatCellValue(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as any).text);
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as any).result);
  return String(v);
}

function renderMarkdownTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length), 3),
  );

  const pad = (s: string, w: number) => s.padEnd(w);
  const headerLine = '| ' + headers.map((h, i) => pad(h, colWidths[i])).join(' | ') + ' |';
  const sepLine = '| ' + colWidths.map((w) => '-'.repeat(w)).join(' | ') + ' |';
  const dataLines = rows.map(
    (row) => '| ' + headers.map((_, i) => pad(row[i] ?? '', colWidths[i])).join(' | ') + ' |',
  );

  return [headerLine, sepLine, ...dataLines].join('\n');
}
