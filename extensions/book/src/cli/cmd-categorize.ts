import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";
import { categorizeTransactions } from "../ai-categorize.js";
import { now, openBookDb } from "../db.js";
import type { Transaction } from "../db.js";

export function registerCategorizeCmd(book: Command): void {
  book
    .command("categorize")
    .description("AI-categorize uncategorized transactions")
    .option("--all", "Re-categorize all transactions, including already categorized ones")
    .option("--model <name>", "Override the AI model (e.g. gpt-4o)")
    .option("--limit <n>", "Max transactions to process", "500")
    .action(async (opts: { all?: boolean; model?: string; limit: string }) => {
      if (opts.model) process.env["OPENCOUNT_AI_MODEL"] = opts.model;

      const db   = openBookDb();
      const rows = (
        opts.all
          ? db.prepare("SELECT * FROM oc_transactions ORDER BY date DESC LIMIT ?").all(Number(opts.limit))
          : db.prepare("SELECT * FROM oc_transactions WHERE category IS NULL ORDER BY date DESC LIMIT ?").all(Number(opts.limit))
      ) as Transaction[];

      if (rows.length === 0) {
        console.log(chalk.dim("  All transactions are already categorized. Use --all to re-run."));
        return;
      }

      console.log(chalk.bold(`\n  Categorizing ${rows.length} transactions…\n`));

      let lastPct = 0;
      const spinner = ora({ text: "Starting…", color: "green" }).start();

      const results = await categorizeTransactions(
        rows.map((r) => ({ description: r.description, amount: r.amount })),
        (done, total) => {
          const pct = Math.round((done / total) * 100);
          if (pct !== lastPct) {
            lastPct = pct;
            const filled = Math.min(Math.round(pct / 3), 34);
          const bar  = "█".repeat(filled) + "░".repeat(34 - filled);
            spinner.text = `${chalk.green(bar)} ${pct}% (${done}/${total})`;
          }
        },
      ).catch((err: unknown) => {
        spinner.fail(`AI call failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      });

      spinner.succeed(`Categorized ${results.length} transactions`);

      const update = db.prepare(
        "UPDATE oc_transactions SET category = ?, subcategory = ?, updated_at = ? WHERE id = ?",
      );
      const commit = db.transaction(() => {
        for (let i = 0; i < rows.length; i++) {
          const r   = rows[i]!;
          const cat = results[i]!;
          update.run(cat.category, cat.subcategory, now(), r.id);
        }
      });
      commit();

      // Summary of assigned categories
      const summary = new Map<string, number>();
      for (const r of results) {
        summary.set(r.category, (summary.get(r.category) ?? 0) + 1);
      }
      console.log(chalk.bold("\n  Category breakdown:"));
      for (const [cat, count] of [...summary.entries()].sort((a, b) => b[1] - a[1])) {
        const bar = "▪".repeat(Math.min(count, 20));
        console.log(`    ${chalk.green(bar)} ${chalk.dim(String(count).padStart(4))}  ${cat}`);
      }

      console.log(
        "\n" + chalk.dim("  Run ") +
        chalk.cyan("openclaw book report") +
        chalk.dim(" to see your spending breakdown."),
      );
    });
}
