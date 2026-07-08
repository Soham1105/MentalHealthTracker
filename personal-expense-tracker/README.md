# Personal Expense Tracker

A private expense tracker built for **Supabase + Vercel**. It uses Supabase Auth for password protection, Supabase Postgres for data, and a Vercel-hosted static frontend.

## Features

- Email/password login through Supabase Auth
- Dashboard with monthly income, spending, net savings, category breakdown, and recent transactions
- CSV and Excel statement import for Indian bank-style files
- Manual transaction entry
- Categories, account names, monthly budgets, planned expenses, and keyword auto-tagging rules
- Row-level security so each logged-in user can only access their own data
- Vercel-ready build command that injects Supabase config from environment variables

## Supabase Setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `docs/schema.sql`.
3. In **Authentication > Providers**, enable Email.
4. In **Authentication > Users**, create your user, or use the app sign-up form.
5. Copy your project URL and anon public key from **Project Settings > API**.

## Local Setup

```bash
cd personal-expense-tracker
cp supabase-config.example.js supabase-config.js
```

Edit `supabase-config.js` with your Supabase URL and anon key.

```bash
npm run dev
```

Open `http://localhost:5173`.

## Vercel Deployment

1. Import this folder as a Vercel project.
2. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Deploy.

The anon key is safe to expose in the browser when RLS policies are enabled. Do not use the Supabase service role key in this app.

## Statement Import Notes

The importer detects common column names:

- Date: `transaction date`, `txn date`, `tran date`, `date`, `value date`
- Description: `description`, `narration`, `particulars`, `remarks`
- Debit: `debit`, `withdrawal`, `dr amount`
- Credit: `credit`, `deposit`, `cr amount`
- Balance: `balance`, `closing balance`

CSV is parsed locally in the browser. Excel files use SheetJS from a CDN at runtime.

## Future Add-ons

PDF parsing and receipt OCR are intentionally left out of this Vercel-static MVP. The best next step is a Vercel serverless function or a separate Python worker for bank-specific PDF parsing and Tesseract OCR.
