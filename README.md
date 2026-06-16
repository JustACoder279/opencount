# opencount

**The finance that openclaw didn't have.**

AI-powered bookkeeping for individuals and small teams — CSV import, AI categorization, beautiful terminal reports. Built as a plugin for [openclaw](https://github.com/openclaw/openclaw).

---

## What it does

```
openclaw book import bank_jan.csv        # import your bank CSV
openclaw book categorize                 # AI-categorize every transaction
openclaw book report                     # render an ASCII breakdown
```

| Command | What it does |
|---|---|
| `openclaw book import <file>` | Auto-detect Chase, BofA, Capital One, Mint, or generic CSV and import |
| `openclaw book add` | Manually add a transaction |
| `openclaw book categorize` | AI-batch-categorize uncategorized transactions |
| `openclaw book report [--month YYYY-MM]` | Monthly summary with ASCII bar chart |
| `openclaw book list [--category X]` | Filter and list transactions |
| `openclaw book team list/add/remove` | Manage team members |
| `openclaw book config set ai.key <key>` | Configure AI provider |

Data lives in `~/.openclaw/book/opencount.sqlite`. Nothing leaves your machine unless you point it at an AI provider.

---

## How to add opencount to openclaw

### Step 1 — Install openclaw

```bash
npm install -g openclaw
```

Requires Node 22+. Verify with `openclaw --version`.

### Step 2 — Add the opencount plugin to your openclaw checkout

openclaw loads plugins from its `extensions/` directory. opencount ships the plugin at `extensions/book/`, so copy that one folder into your openclaw **source checkout** and build — don't clone the whole repo into `extensions/`:

```bash
# Run these from the root of your openclaw source checkout
git clone https://github.com/JustACoder279/opencount /tmp/opencount
cp -r /tmp/opencount/extensions/book extensions/book
pnpm install
pnpm build
```

### Step 3 — Set up an AI provider

opencount uses the OpenAI API format. Any compatible provider works:

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."

# Ollama (fully local, free)
export OPENCOUNT_AI_BASE_URL="http://localhost:11434/v1"
export OPENCOUNT_AI_MODEL="llama3.2"

# Or save permanently
openclaw book config set ai.key "sk-..."
openclaw book config set ai.model "gpt-4o-mini"
```

### Step 4 — Use it

```bash
openclaw book import ~/Downloads/chase_jan.csv
openclaw book categorize
openclaw book report
```

---

## Supported AI providers

Any provider that speaks the OpenAI chat-completions format:

| Provider | Notes |
|---|---|
| OpenAI | GPT-4o, GPT-4o-mini, o1, o3 |
| Ollama | Fully local — no cost, no data leaves your machine |
| Google Gemini | Flash, Pro, Ultra |
| Groq | Llama, Mixtral — very fast |
| LM Studio | Any GGUF model |
| Together AI | 70B+ open models |
| DeepSeek | Coder, Chat |
| OpenRouter | 150+ models |

---

## Supported CSV formats

Auto-detected from headers — no configuration needed:

- **Chase** (`Transaction Date, Post Date, Description, Category, Type, Amount, Memo`)
- **Bank of America** (`Posted Date, Reference Number, Payee, Address, Amount`)
- **Capital One** (`Transaction Date, Posted Date, Card No., Details, Debit, Credit`)
- **Mint** (`Date, Description, Original Description, Amount, Transaction Type, Category, Account Name, Labels, Notes`)
- **Generic** (any CSV with Date + Description + Amount columns)

---

## Data storage

Everything is stored locally in SQLite at `~/.openclaw/book/opencount.sqlite`. Tables:

- `oc_transactions` — all imported and manually added transactions
- `oc_users` — team members (admin/member/viewer roles)
- `oc_config` — AI provider settings

---

## Plugin structure

```
extensions/book/
├── index.ts                    # plugin entry — registers book CLI command
├── openclaw.plugin.json        # plugin manifest
├── package.json
└── src/
    ├── db.ts                   # SQLite schema and helpers
    ├── csv-import.ts           # CSV format detection and import
    ├── ai-categorize.ts        # OpenAI-compatible categorization
    ├── reports.ts              # ASCII bar charts and tables
    └── cli/
        ├── book-cli.ts         # registers all subcommands
        ├── cmd-import.ts       # book import
        ├── cmd-add.ts          # book add
        ├── cmd-categorize.ts   # book categorize
        ├── cmd-report.ts       # book report
        ├── cmd-list.ts         # book list
        ├── cmd-team.ts         # book team
        └── cmd-config.ts       # book config
```

---

## License

MIT — see [LICENSE](LICENSE)
