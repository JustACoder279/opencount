/**
 * opencount database layer — stores transactions, users, and config
 * in a dedicated SQLite file alongside openclaw's state directory.
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Transaction = {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: string | null;
  subcategory: string | null;
  account: string | null;
  currency: string;
  notes: string | null;
  source: string;
  source_id: string | null;
  user_name: string | null;
  created_at: string;
  updated_at: string;
};

export type BookUser = {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "member" | "viewer";
  created_at: string;
};

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS oc_transactions (
    id          TEXT PRIMARY KEY,
    date        TEXT NOT NULL,
    amount      REAL NOT NULL,
    description TEXT NOT NULL,
    category    TEXT,
    subcategory TEXT,
    account     TEXT,
    currency    TEXT NOT NULL DEFAULT 'USD',
    notes       TEXT,
    source      TEXT NOT NULL DEFAULT 'manual',
    source_id   TEXT,
    user_name   TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_oc_tx_date     ON oc_transactions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_oc_tx_category ON oc_transactions(category)`,
  `CREATE TABLE IF NOT EXISTS oc_users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE,
    role       TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS oc_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  // Unique index on source_id so INSERT OR IGNORE actually deduplicates CSV re-imports.
  // Partial index excludes NULLs (manual transactions have no source_id).
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_oc_tx_source_id ON oc_transactions(source_id) WHERE source_id IS NOT NULL`,
];

export const DEFAULT_CATEGORIES: Record<string, string[]> = {
  "Food & Dining":    ["Restaurants", "Groceries", "Coffee & Drinks", "Takeout"],
  "Transportation":   ["Fuel", "Public Transit", "Parking", "Rideshare"],
  "Shopping":         ["Clothing", "Electronics", "Home & Garden", "Online Shopping"],
  "Utilities":        ["Electricity", "Water", "Internet", "Phone", "Gas"],
  "Entertainment":    ["Streaming", "Events & Shows", "Hobbies", "Games"],
  "Healthcare":       ["Medical", "Pharmacy", "Insurance", "Fitness"],
  "Travel":           ["Flights", "Hotels", "Activities", "Car Rental"],
  "Housing":          ["Rent", "Mortgage", "Maintenance", "Furniture"],
  "Education":        ["Tuition", "Books", "Online Courses", "Supplies"],
  "Personal Care":    ["Haircut", "Beauty", "Spa"],
  "Subscriptions":    ["Software", "Memberships", "Newspapers"],
  "Business":         ["Office Supplies", "Software Tools", "Professional Services"],
  "Taxes":            ["Income Tax", "Property Tax", "Other Taxes"],
  "Income":           ["Salary", "Freelance", "Investment Returns", "Rental Income", "Other Income"],
  "Transfers":        ["Bank Transfer", "Credit Card Payment", "Savings"],
  "Other":            ["Miscellaneous"],
};

let _db: Database.Database | null = null;

export function resolveBookDbPath(): string {
  const stateDir =
    process.env.OPENCLAW_STATE_DIR ??
    process.env.OPENCOUNT_STATE_DIR ??
    join(homedir(), ".openclaw");
  const bookDir = join(stateDir, "book");
  if (!existsSync(bookDir)) {
    mkdirSync(bookDir, { recursive: true });
  }
  return join(bookDir, "opencount.sqlite");
}

function runMigrations(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS oc_schema_version (version INTEGER NOT NULL)`,
  );
  const row = db
    .prepare("SELECT MAX(version) as v FROM oc_schema_version")
    .get() as { v: number | null };
  const current = row?.v ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]!);
    db.prepare("INSERT INTO oc_schema_version (version) VALUES (?)").run(i + 1);
  }
}

export function openBookDb(): Database.Database {
  if (_db) return _db;
  const dbPath = resolveBookDbPath();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  _db = db;
  return db;
}

export function getBookConfig(key: string): string | null {
  const db = openBookDb();
  const row = db.prepare("SELECT value FROM oc_config WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setBookConfig(key: string, value: string): void {
  openBookDb()
    .prepare("INSERT OR REPLACE INTO oc_config (key, value) VALUES (?, ?)")
    .run(key, value);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
