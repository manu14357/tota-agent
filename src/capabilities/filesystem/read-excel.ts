import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { existsSync, statSync } from 'node:fs';
import { resolve, isAbsolute, extname } from 'node:path';
import type { PermissionManager } from '../permissions.js';

const EXCEL_EXTS = new Set(['.xlsx', '.xlsm', '.xls', '.xlsb', '.ods', '.csv']);

export function createReadExcelTool(permissions: PermissionManager, getCwd: () => string) {
  return tool({
    description:
      'Read an Excel or spreadsheet file (.xlsx, .xls, .ods, .csv). Returns sheet names and data as a markdown table or JSON. Use this when the user sends or references a spreadsheet file.',
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
        const ExcelJS = await import('exceljs').catch((e) => {
          throw new Error(`exceljs is not installed. Run: npm install exceljs\n${e.message}`);
        });

        const workbook = new ExcelJS.default.Workbook();

        if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xlsb') {
          await workbook.xlsx.readFile(resolved);
        } else if (ext === '.csv') {
          await workbook.csv.readFile(resolved);
        } else {
          // .xls and .ods — try xlsx reader as fallback
          await workbook.xlsx.readFile(resolved);
        }

        // Resolve sheet
        const sheetNames = workbook.worksheets.map((ws) => ws.name);
        if (sheetNames.length === 0) {
          return `Error: Workbook contains no sheets.`;
        }

        let worksheet = workbook.worksheets[0];
        if (sheet) {
          const byName = workbook.getWorksheet(sheet);
          const byIndex = !isNaN(Number(sheet)) ? workbook.worksheets[Number(sheet) - 1] : undefined;
          if (byName) worksheet = byName;
          else if (byIndex) worksheet = byIndex;
          else return `Error: Sheet "${sheet}" not found. Available sheets: ${sheetNames.join(', ')}`;
        }

        // Extract rows
        const rows: string[][] = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          const cells = (row.values as any[]).slice(1); // index 0 is always null in exceljs
          rows.push(cells.map((c) => cellToString(c)));
        });

        if (rows.length === 0) {
          return `Sheet "${worksheet.name}" is empty.\nAvailable sheets: ${sheetNames.join(', ')}`;
        }

        const header = rows[0];
        const dataRows = rows.slice(1, 1 + max_rows);
        const truncated = rows.length - 1 > max_rows;

        let output =
          `File: ${resolved}\n` +
          `Sheet: ${worksheet.name} (${rows.length - 1} data rows)\n` +
          (sheetNames.length > 1 ? `Other sheets: ${sheetNames.filter((n) => n !== worksheet.name).join(', ')}\n` : '') +
          (truncated ? `(Showing first ${max_rows} of ${rows.length - 1} rows)\n` : '') +
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
        if (err.message?.includes('exceljs is not installed')) return `Error: ${err.message}`;
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
        const ExcelJS = await import('exceljs').catch((e) => {
          throw new Error(`exceljs is not installed. Run: npm install exceljs\n${e.message}`);
        });

        const workbook = new ExcelJS.default.Workbook();
        const worksheet = workbook.addWorksheet(sheet_name);

        worksheet.addRow(headers);
        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };

        for (const row of rows) {
          worksheet.addRow(row);
        }

        // Auto-fit columns (approximate)
        worksheet.columns.forEach((col, i) => {
          const maxLen = Math.max(
            (headers[i] ?? '').length,
            ...rows.map((r) => String(r[i] ?? '').length),
          );
          col.width = Math.min(Math.max(maxLen + 2, 10), 60);
        });

        await workbook.xlsx.writeFile(resolved);
        return `Excel file written: ${resolved} (${rows.length} rows, ${headers.length} columns)`;
      } catch (err: any) {
        if (err.message?.includes('exceljs is not installed')) return `Error: ${err.message}`;
        return `Error writing Excel file: ${err.message}`;
      }
    },
  });
}

function cellToString(cell: any): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object') {
    // RichText or hyperlink
    if (cell.text !== undefined) return String(cell.text);
    if (cell.richText) return cell.richText.map((r: any) => r.text ?? '').join('');
    if (cell.result !== undefined) return String(cell.result); // formula result
    return JSON.stringify(cell);
  }
  return String(cell);
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
