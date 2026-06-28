import chalk from "chalk";
import readline from "node:readline/promises";
import type { Command } from "commander";
import { DEFAULT_CATEGORIES, generateId, now, openBookDb } from "../db.js";

export function registerAddCmd(book: Command): void {
  book
    .command("add")
    .description("Manually add a transaction")
    .option("--date <YYYY-MM-DD>", "Transaction date (default: today)")
    .option("--amount <number>", "Amount (negative = expense)")
    .option("--description <text>", "Description")
    .option("--category <name>", "Category")
    .option("--account <name>", "Account name")
    .action(async (opts: {
      date?: string;
      amount?: string;
      description?: string;
      category?: string;
      account?: string;
    }) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const dateInput = opts.date ?? (await rl.question(
        chalk.cyan("Date") + chalk.dim(" [today]: "),
      )) || new Date().toISOString().slice(0, 10);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput) || Number.isNaN(new Date(dateInput).getTime())) {
        rl.close();
        console.error(chalk.red("  Invalid date. Use YYYY-MM-DD format (e.g. 2024-01-15)."));
        process.exit(1);
      }
      const date = dateInput;

      const amountRaw = opts.amount ?? await rl.question(chalk.cyan("Amount") + chalk.dim(" (negative = expense): "));
      const amount    = Number.parseFloat(amountRaw.replace(/[$,]/g, ""));

      if (Number.isNaN(amount)) {
        rl.close();
        console.error(chalk.red("  Invalid amount."));
        process.exit(1);
      }

      const description = opts.description ?? await rl.question(chalk.cyan("Description") + ": ");
      if (!description.trim()) {
        rl.close();
        console.error(chalk.red("  Description cannot be empty."));
        process.exit(1);
      }

      // Show category menu
      let category = opts.category;
      if (!category) {
        const cats = Object.keys(DEFAULT_CATEGORIES);
        console.log(chalk.dim("\n  Categories:"));
        cats.forEach((c, i) => console.log(`    ${chalk.cyan(String(i + 1).padStart(2))}. ${c}`));
        const pick = await rl.question(chalk.cyan("\n  Pick category") + chalk.dim(" [number or name]: "));
        const num  = Number.parseInt(pick, 10);
        category   = Number.isNaN(num) ? pick : (cats[num - 1] ?? "Other");
      }

      const account = opts.account ?? (await rl.question(chalk.cyan("Account") + chalk.dim(" [optional]: ")));
      rl.close();

      const db = openBookDb();
      const ts = now();
      db.prepare(`
        INSERT INTO oc_transactions (id, date, amount, description, category, account, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)
      `).run(generateId(), date, amount, description.trim(), category, account || null, ts, ts);

      console.log(chalk.green("\n  ✓ Transaction added."));
    });
}
