/**
 * CSV transaction importer with auto-detection for common bank formats.
 */
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";

export type RawTransaction = {
  date: string;
  amount: number;
  description: string;
  account?: string;
  currency?: string;
  source_id?: string;
};

type BankFormat = {
  name: string;
  detect: (headers: string[]) => boolean;
  parse: (row: Record<string, string>) => RawTransaction | null;
};

function normalizeAmount(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  return Number.parseFloat(cleaned);
}

function parseDate(raw: string): string {
  // Check MM/DD/YYYY first — the Date constructor parses this as local midnight,
  // which toISOString() shifts to UTC and can roll the date back one day in
  // US/western timezones. Build the ISO string directly from the parts instead.
  const slashed = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashed) {
    return `${slashed[3]}-${slashed[1]!.padStart(2, "0")}-${slashed[2]!.padStart(2, "0")}`;
  }
  // ISO-like strings (YYYY-MM-DD) are parsed as UTC by the Date constructor, safe to use.
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return raw;
}

const BANK_FORMATS: BankFormat[] = [
  {
    name: "Chase Bank",
    detect: (h) =>
      h.includes("Transaction Date") && h.includes("Description") && h.includes("Amount"),
    parse: (row) => {
      const amount = normalizeAmount(row["Amount"] ?? "0");
      return {
        date: parseDate(row["Transaction Date"] ?? ""),
        amount,
        description: row["Description"] ?? "",
        account: row["Type"] ?? undefined,
      };
    },
  },
  {
    name: "Bank of America",
    detect: (h) =>
      h.includes("Posted Date") && h.includes("Payee") && h.includes("Amount"),
    parse: (row) => {
      const raw = row["Amount"] ?? "0";
      const amount = normalizeAmount(raw);
      return {
        date: parseDate(row["Posted Date"] ?? ""),
        amount,
        description: row["Payee"] ?? "",
      };
    },
  },
  {
    name: "Capital One",
    detect: (h) =>
      h.includes("Transaction Date") &&
      h.includes("Description") &&
      (h.includes("Debit") || h.includes("Credit")),
    parse: (row) => {
      const debit = normalizeAmount(row["Debit"] ?? "0");
      const credit = normalizeAmount(row["Credit"] ?? "0");
      const amount = Number.isNaN(credit) || credit === 0 ? -Math.abs(debit) : credit;
      return {
        date: parseDate(row["Transaction Date"] ?? ""),
        amount,
        description: row["Description"] ?? "",
      };
    },
  },
  {
    name: "Mint / Generic",
    detect: (h) =>
      h.includes("Date") &&
      (h.includes("Description") || h.includes("Original Description")) &&
      (h.includes("Amount") || h.includes("Transaction Type")),
    parse: (row) => {
      const raw = normalizeAmount(row["Amount"] ?? "0");
      const txType = (row["Transaction Type"] ?? "debit").toLowerCase();
      const amount = txType === "debit" ? -Math.abs(raw) : Math.abs(raw);
      return {
        date: parseDate(row["Date"] ?? ""),
        amount,
        description: row["Description"] ?? row["Original Description"] ?? "",
        account: row["Account Name"] ?? undefined,
      };
    },
  },
  {
    name: "Generic CSV",
    detect: (h) =>
      (h.some((x) => /date/i.test(x)) &&
        h.some((x) => /amount|total|sum/i.test(x)) &&
        h.some((x) => /desc|memo|payee|narr/i.test(x))),
    parse: (row) => {
      const dateKey = Object.keys(row).find((k) => /date/i.test(k)) ?? "";
      const amountKey = Object.keys(row).find((k) => /amount|total|sum/i.test(k)) ?? "";
      const descKey =
        Object.keys(row).find((k) => /desc|memo|payee|narr/i.test(k)) ?? "";
      if (!dateKey || !amountKey || !descKey) return null;
      return {
        date: parseDate(row[dateKey] ?? ""),
        amount: normalizeAmount(row[amountKey] ?? "0"),
        description: row[descKey] ?? "",
      };
    },
  },
];

export type ImportResult = {
  transactions: RawTransaction[];
  formatName: string;
  totalRows: number;
  skipped: number;
};

export function importCsv(filePath: string): ImportResult {
  const raw = readFileSync(filePath, "utf8");
  const records: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  if (records.length === 0) {
    return { transactions: [], formatName: "Empty", totalRows: 0, skipped: 0 };
  }

  const headers = Object.keys(records[0]!);
  const format = BANK_FORMATS.find((f) => f.detect(headers));
  const formatName = format?.name ?? "Unknown";

  const transactions: RawTransaction[] = [];
  let skipped = 0;

  for (const row of records) {
    const parsed = format ? format.parse(row) : null;
    if (!parsed || Number.isNaN(parsed.amount)) {
      skipped++;
      continue;
    }
    if (!parsed.date || !parsed.description) {
      skipped++;
      continue;
    }
    transactions.push(parsed);
  }

  return { transactions, formatName, totalRows: records.length, skipped };
}
