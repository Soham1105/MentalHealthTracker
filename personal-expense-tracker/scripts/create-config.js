const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const target = path.join(__dirname, "..", "supabase-config.js");

if (!supabaseUrl || !supabaseAnonKey) {
  if (fs.existsSync(target)) {
    console.log("Using existing supabase-config.js");
    process.exit(0);
  }

  fs.copyFileSync(path.join(__dirname, "..", "supabase-config.example.js"), target);
  console.log("Created supabase-config.js from example. Add real Supabase values before using.");
  process.exit(0);
}

const js = `window.EXPENSE_TRACKER_CONFIG = ${JSON.stringify(
  { supabaseUrl, supabaseAnonKey },
  null,
  2
)};\n`;

fs.writeFileSync(target, js);
console.log("Created supabase-config.js from environment variables.");
