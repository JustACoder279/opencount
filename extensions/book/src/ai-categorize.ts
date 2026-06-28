/**
 * AI categorization engine. Reads provider config from environment
 * (OPENAI_API_KEY, OPENCOUNT_AI_BASE_URL, OPENCOUNT_AI_MODEL) or
 * from openclaw's stored book config, then uses the OpenAI-compatible
 * API to classify transactions in batches.
 */
import OpenAI from "openai";
import { getBookConfig } from "./db.js";

export type CatResult = {
  category: string;
  subcategory: string | null;
  confidence: number;
};

const SYSTEM_PROMPT = `You are a financial categorization assistant. Categorize each transaction.

Available categories (use exactly these names):
Food & Dining, Transportation, Shopping, Utilities, Entertainment, Healthcare,
Travel, Housing, Education, Personal Care, Subscriptions, Business, Taxes,
Income, Transfers, Other

Subcategories for context: Restaurants, Groceries, Coffee & Drinks, Takeout,
Fuel, Public Transit, Parking, Rideshare, Clothing, Electronics, Home & Garden,
Electricity, Water, Internet, Phone, Gas, Streaming, Events & Shows, Medical,
Pharmacy, Flights, Hotels, Rent, Mortgage, Salary, Freelance, Investment Returns,
Bank Transfer, Credit Card Payment, Miscellaneous

Rules:
- Use the description to determine the category — do not rely on the sign of the amount alone.
- Reserve the Income category for actual income sources: salary, payroll, freelance payments, dividends, rental income, interest earned.
- Positive amounts that are refunds, cashback, credits, or reimbursements belong in their original expense category (e.g. Shopping) or Transfers — not Income.
- Negative amounts are typically expenses; categorize by the merchant or description.
- Return only JSON: {"results":[{"category":"...","subcategory":"..." or null,"confidence":0.0-1.0},...]}
- Match array index to input index`;

function buildClient(): OpenAI {
  const apiKey =
    process.env.OPENAI_API_KEY ??
    process.env.OPENCOUNT_AI_KEY ??
    getBookConfig("ai.key") ??
    "sk-placeholder";

  const baseURL =
    process.env.OPENCOUNT_AI_BASE_URL ??
    getBookConfig("ai.baseUrl") ??
    undefined;

  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

function resolveModel(): string {
  return (
    process.env.OPENCOUNT_AI_MODEL ??
    getBookConfig("ai.model") ??
    "gpt-4o-mini"
  );
}

export async function categorizeTransactions(
  transactions: Array<{ description: string; amount: number }>,
  onProgress?: (done: number, total: number) => void,
): Promise<CatResult[]> {
  const client = buildClient();
  const model = resolveModel();
  const BATCH = 25;
  const results: CatResult[] = [];

  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH);
    const userMsg = batch
      .map((t, idx) => `${idx + 1}. "${t.description}" | amount: ${t.amount}`)
      .join("\n");

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Categorize:\n${userMsg}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content ?? '{"results":[]}';
    let parsed: { results: CatResult[] };
    try {
      parsed = JSON.parse(content) as { results: CatResult[] };
    } catch {
      parsed = { results: [] };
    }

    const batchResults = Array.isArray(parsed.results) ? parsed.results : [];
    for (let j = 0; j < batch.length; j++) {
      const item = batchResults[j];
      results.push({
        category: item?.category ?? "Other",
        subcategory: item?.subcategory ?? null,
        confidence: item?.confidence ?? 0,
      });
    }

    onProgress?.(Math.min(i + BATCH, transactions.length), transactions.length);
  }

  return results;
}
