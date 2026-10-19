# ExpenseSnap – Personal Expense Tracker & Bill Splitter

ExpenseSnap is a personal finance web app built with React and Vite. You use it in the browser: there are no user accounts, no cloud sync, and no automatic backups. All data stays on your device in **browser localStorage** (plain JSON or text—not encrypted).

## What you can do

The app has five main sections:

| Section | Purpose |
| -------- | -------- |
| **Dashboard** | Overview of income, expenses, and net balance; current-month totals; recent activity. |
| **Transactions** | Add, edit, and delete income and expense entries; filter and search your history. |
| **Bill Splitter** | Split a bill amount equally among a number of people (handles rounding in paise). |
| **Analytics** | Pick a month to see charts, category breakdown, and spending insights. |
| **Settings** | Custom categories, light/dark theme, and manual JSON backup/restore. |

### Transactions

- Record **income** or **expense** with amount (INR), date, category, and optional description.
- **Built-in categories** include Food, Transport, Housing, Utilities, Health, Shopping, Salary, and Other (see `src/transactions/categories.js`).
- **Custom categories** you create in Settings (expense or income type).
- **Search** descriptions, filter by type and category, and filter by date range.
- **Edit** and **delete** existing entries.
- **Voice dictation** for descriptions where your browser supports the Web Speech API (optional; not available everywhere).

### Analytics

- Monthly expense charts and category views.
- Insight messages (for example top category and comparison to the previous month) based on saved transactions.

### Bill Splitter

- Enter a total amount and number of people; the app calculates equal shares and distributes any rounding remainder.

### Settings

- **Categories:** add, rename, or remove custom categories (built-in categories cannot be removed).
- **Theme:** switch between light and dark mode; your choice is saved in this browser.
- **Backup and restore:** download or upload a JSON file on your computer (nothing is uploaded to a server).

## Data storage

ExpenseSnap V1 stores data **only in this browser profile**:

| localStorage key | Contents |
| ---------------- | -------- |
| `expensesnap.transactions.v1` | Saved transactions (JSON array) |
| `expensesnap.categories.v1` | Custom categories (JSON array) |
| `expensesnap.theme.v1` | Theme preference (`light` or `dark`) |

Data does **not** sync across devices, browsers, or profiles. Clearing site data or browser storage can **permanently remove** your records. Keep JSON backups in a safe place you control.

## Backup and restore

Backups are **manual** JSON files you download from Settings. Each file includes:

- `backupVersion` (currently version **1**)
- `exportedAt` (UTC timestamp)
- `transactions`
- `categories` (custom categories only; built-in categories are not stored in the backup)

**Download:** exports all saved transactions and custom categories to a file named like `expensesnap-backup-YYYY-MM-DD.json`.

**Restore modes:**

- **Merge** – Adds records from the backup that are not already present (matched by id). If the same id exists but the record differs, the merge **fails** and **saved data is left unchanged**. Merge is **not available** if saved transactions or categories cannot be read (for example corrupted JSON). In that case use Replace with a valid backup.
- **Replace** – Removes all saved transactions and custom categories, then loads the backup. Built-in categories are unchanged. Replace requires a **two-step confirmation** in the UI. If local data was unreadable, Replace can **overwrite** that corrupted storage as part of recovery.

Invalid JSON, unsupported backup versions, or backups where transactions reference missing categories are **rejected** without changing storage. If a restore fails partway through, the app attempts to roll back what it can and shows an error message.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm (included with Node.js)

## Setup

1. Clone or download this repository.
2. Open the project folder in your editor or terminal.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local URL shown in the terminal (usually `http://localhost:5173`).

## Commands

| Command | Description |
| -------- | ------------ |
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run oxlint on the project |
| `npm run test:regression` | Run Node regression checks (storage, backup, splits, analytics, theme) |
| `node scripts/regression-check.mjs` | Same as `test:regression` |

The regression script uses in-memory storage only; it does **not** read or write your browser localStorage.

## Tech stack

- React 19
- Vite 8
- JavaScript and CSS
- Browser localStorage
- Web Speech API (optional dictation)

## Limitations

- **No accounts, encryption, cloud sync, or automatic backup**—only manual JSON export/import.
- Data is tied to **this browser and profile**; use backups before clearing storage or switching devices.
- Bill splitting is **equal split only** (not itemized or custom shares).
- Voice dictation depends on browser and OS support.
- The regression script validates core logic in Node; it is not a full browser UI test suite.

## Project status

ExpenseSnap V1 is feature-complete for local personal tracking; continue to verify changes with lint, build, and regression checks before release.
