(function () {
  const config = window.EXPENSE_TRACKER_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const state = {
    client: null,
    session: null,
    user: null,
    categories: [],
    transactions: [],
    budgets: [],
    planned: [],
    rules: [],
    currentView: "dashboard"
  };

  const columnAliases = {
    date: ["transaction date", "txn date", "tran date", "date", "value date", "posted date"],
    description: ["description", "narration", "particulars", "remarks", "details", "transaction details"],
    debit: ["debit", "withdrawal", "withdrawal amt.", "withdrawal amount", "dr amount", "debit amount", "paid out"],
    credit: ["credit", "deposit", "deposit amt.", "deposit amount", "cr amount", "credit amount", "paid in"],
    amount: ["amount", "transaction amount", "txn amount"],
    type: ["type", "transaction type", "dr/cr", "debit/credit"],
    balance: ["balance", "closing balance", "running balance", "available balance"]
  };

  const defaultCategories = [
    ["Food & Dining", "#df6a4f", "expense"],
    ["Groceries", "#b7791f", "expense"],
    ["Shopping", "#7c3aed", "expense"],
    ["Transport", "#2563eb", "expense"],
    ["Bills & Utilities", "#0f766e", "expense"],
    ["Health", "#dc2626", "expense"],
    ["Entertainment", "#9333ea", "expense"],
    ["Transfers", "#64748b", "expense"],
    ["Salary", "#15803d", "income"],
    ["Refunds", "#0891b2", "income"]
  ];

  const defaultRules = [
    ["swiggy", "Food & Dining"],
    ["zomato", "Food & Dining"],
    ["blinkit", "Groceries"],
    ["zepto", "Groceries"],
    ["amazon", "Shopping"],
    ["flipkart", "Shopping"],
    ["uber", "Transport"],
    ["ola", "Transport"],
    ["electricity", "Bills & Utilities"],
    ["salary", "Salary"],
    ["refund", "Refunds"]
  ];

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!config.supabaseUrl || !config.supabaseAnonKey || config.supabaseUrl.includes("YOUR_PROJECT_REF")) {
      showToast("Add your Supabase URL and anon key in supabase-config.js or Vercel env vars.");
      return;
    }

    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    bindEvents();

    state.client.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    state.client.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }

  function bindEvents() {
    $("#auth-form").addEventListener("submit", signIn);
    $("#signup-button").addEventListener("click", signUp);
    $("#logout-button").addEventListener("click", () => state.client.auth.signOut());
    $("#refresh-button").addEventListener("click", loadData);
    $("#global-search").addEventListener("input", renderAll);
    $("#filter-month").addEventListener("change", renderAll);
    $("#filter-direction").addEventListener("change", renderTransactions);
    $("#transaction-form").addEventListener("submit", saveTransaction);
    $("#reset-transaction").addEventListener("click", resetTransactionForm);
    $("#import-form").addEventListener("submit", importStatement);
    $("#category-form").addEventListener("submit", saveCategory);
    $("#budget-form").addEventListener("submit", saveBudget);
    $("#planned-form").addEventListener("submit", savePlanned);
    $("#rule-form").addEventListener("submit", saveRule);

    $$(".nav-link").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });

    $$("[data-jump]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.jump));
    });
  }

  async function setSession(session) {
    state.session = session;
    state.user = session ? session.user : null;

    $("#auth-screen").classList.toggle("hidden", Boolean(session));
    $("#app-shell").classList.toggle("hidden", !session);

    if (!session) {
      return;
    }

    $("#user-email").textContent = session.user.email || "";
    setDefaultDates();
    await ensureDefaults();
    await loadData();
  }

  async function signIn(event) {
    event.preventDefault();
    const email = $("#auth-email").value.trim();
    const password = $("#auth-password").value;
    const { error } = await state.client.auth.signInWithPassword({ email, password });
    if (error) showToast(error.message);
  }

  async function signUp() {
    const email = $("#auth-email").value.trim();
    const password = $("#auth-password").value;
    if (!email || !password) {
      showToast("Enter email and password first.");
      return;
    }
    const { error } = await state.client.auth.signUp({ email, password });
    if (error) {
      showToast(error.message);
      return;
    }
    showToast("Account created. Check email if confirmation is enabled, then sign in.");
  }

  async function ensureDefaults() {
    const userId = state.user.id;
    const { data: categories, error } = await state.client
      .from("categories")
      .select("id,name,kind")
      .eq("user_id", userId)
      .limit(1);

    if (error) {
      showToast(error.message);
      return;
    }

    if (categories.length) return;

    const categoryRows = defaultCategories.map(([name, color, kind]) => ({
      user_id: userId,
      name,
      color,
      kind
    }));

    const { data: inserted, error: insertError } = await state.client
      .from("categories")
      .insert(categoryRows)
      .select("id,name");

    if (insertError) {
      showToast(insertError.message);
      return;
    }

    const byName = new Map(inserted.map((category) => [category.name, category.id]));
    const ruleRows = defaultRules
      .filter(([, categoryName]) => byName.has(categoryName))
      .map(([match_text, categoryName], index) => ({
        user_id: userId,
        match_text,
        category_id: byName.get(categoryName),
        priority: index + 10
      }));

    if (ruleRows.length) {
      await state.client.from("tag_rules").insert(ruleRows);
    }
  }

  async function loadData() {
    const userId = state.user.id;
    const [categories, transactions, budgets, planned, rules] = await Promise.all([
      state.client.from("categories").select("*").eq("user_id", userId).order("name"),
      state.client.from("transactions").select("*, categories(name,color,kind)").eq("user_id", userId).order("txn_date", { ascending: false }).limit(1500),
      state.client.from("monthly_budgets").select("*, categories(name,color)").eq("user_id", userId).order("month", { ascending: false }),
      state.client.from("planned_expenses").select("*, categories(name,color)").eq("user_id", userId).order("due_date", { ascending: true, nullsFirst: false }),
      state.client.from("tag_rules").select("*, categories(name,color)").eq("user_id", userId).order("priority")
    ]);

    const firstError = [categories, transactions, budgets, planned, rules].find((result) => result.error);
    if (firstError) {
      showToast(firstError.error.message);
      return;
    }

    state.categories = categories.data || [];
    state.transactions = transactions.data || [];
    state.budgets = budgets.data || [];
    state.planned = planned.data || [];
    state.rules = rules.data || [];
    renderAll();
  }

  function renderAll() {
    renderCategoryOptions();
    renderMonthFilter();
    renderDashboard();
    renderTransactions();
    renderBudgets();
    renderPlanned();
    renderSettings();
  }

  function switchView(view) {
    state.currentView = view;
    $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
    $("#view-title").textContent = titleCase(view);
  }

  function renderCategoryOptions() {
    const expenseCategories = state.categories.filter((category) => category.kind === "expense");
    const allOptions = state.categories.map(categoryOption).join("");
    const expenseOptions = expenseCategories.map(categoryOption).join("");
    $("#txn-category").innerHTML = `<option value="">Uncategorized</option>${allOptions}`;
    $("#budget-category").innerHTML = expenseOptions;
    $("#planned-category").innerHTML = `<option value="">Uncategorized</option>${expenseOptions}`;
    $("#rule-category").innerHTML = allOptions;
  }

  function categoryOption(category) {
    return `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`;
  }

  function renderMonthFilter() {
    const select = $("#filter-month");
    const current = select.value || currentMonth();
    const months = Array.from(new Set(state.transactions.map((txn) => monthKey(txn.txn_date))));
    if (!months.includes(currentMonth())) months.unshift(currentMonth());
    select.innerHTML = [`<option value="all">All months</option>`]
      .concat(months.map((month) => `<option value="${month}">${month}</option>`))
      .join("");
    select.value = months.includes(current) || current === "all" ? current : currentMonth();
  }

  function renderDashboard() {
    const month = currentMonth();
    const monthly = state.transactions.filter((txn) => monthKey(txn.txn_date) === month);
    const spending = sum(monthly.filter((txn) => txn.direction === "expense").map((txn) => txn.amount));
    const income = sum(monthly.filter((txn) => txn.direction === "income").map((txn) => txn.amount));

    $("#metric-spending").textContent = formatMoney(spending);
    $("#metric-income").textContent = formatMoney(income);
    $("#metric-net").textContent = formatMoney(income - spending);
    $("#metric-net").className = income - spending >= 0 ? "positive" : "negative";
    $("#metric-count").textContent = monthly.length;
    $("#category-month-label").textContent = month;

    renderCategoryBreakdown(monthly, spending);
    renderRecentTransactions();
  }

  function renderCategoryBreakdown(transactions, totalSpending) {
    const byCategory = new Map();
    transactions
      .filter((txn) => txn.direction === "expense")
      .forEach((txn) => {
        const name = txn.categories?.name || "Uncategorized";
        const color = txn.categories?.color || "#64748b";
        const existing = byCategory.get(name) || { name, color, total: 0 };
        existing.total += Number(txn.amount);
        byCategory.set(name, existing);
      });

    const rows = Array.from(byCategory.values()).sort((a, b) => b.total - a.total);
    $("#category-breakdown").innerHTML = rows.length
      ? rows
          .map((row) => {
            const pct = totalSpending ? Math.min(100, (row.total / totalSpending) * 100) : 0;
            return `
              <div class="breakdown-item">
                <div class="breakdown-top">
                  <strong><span class="swatch" style="background:${escapeHtml(row.color)}"></span> ${escapeHtml(row.name)}</strong>
                  <span>${formatMoney(row.total)}</span>
                </div>
                <div class="bar"><span style="width:${pct}%;background:${escapeHtml(row.color)}"></span></div>
              </div>
            `;
          })
          .join("")
      : `<div class="empty">No spending recorded for this month.</div>`;
  }

  function renderRecentTransactions() {
    $("#recent-transactions").innerHTML = state.transactions.slice(0, 8).map(miniTransactionRow).join("") || `<div class="empty">No transactions yet.</div>`;
  }

  function renderTransactions() {
    const search = $("#global-search").value.trim().toLowerCase();
    const month = $("#filter-month").value || currentMonth();
    const direction = $("#filter-direction").value;

    const rows = state.transactions.filter((txn) => {
      const matchesSearch = !search || [txn.description, txn.account_name, txn.source, txn.categories?.name].join(" ").toLowerCase().includes(search);
      const matchesMonth = month === "all" || monthKey(txn.txn_date) === month;
      const matchesDirection = direction === "all" || txn.direction === direction;
      return matchesSearch && matchesMonth && matchesDirection;
    });

    $("#transactions-table").innerHTML = rows.length
      ? rows.map(transactionTableRow).join("")
      : `<tr><td colspan="6"><div class="empty">No transactions match the current filters.</div></td></tr>`;

    $$("#transactions-table [data-edit]").forEach((button) => {
      button.addEventListener("click", () => editTransaction(button.dataset.edit));
    });

    $$("#transactions-table [data-delete]").forEach((button) => {
      button.addEventListener("click", () => deleteTransaction(button.dataset.delete));
    });
  }

  function transactionTableRow(txn) {
    const amountClass = txn.direction === "income" ? "positive" : "negative";
    return `
      <tr>
        <td>${formatDate(txn.txn_date)}</td>
        <td>
          <strong>${escapeHtml(txn.description)}</strong><br>
          <span class="muted">${escapeHtml(txn.source || "Manual")}</span>
        </td>
        <td>${categoryPill(txn.categories)}</td>
        <td>${escapeHtml(txn.account_name || "Primary")}</td>
        <td class="amount-cell ${amountClass}">${txn.direction === "income" ? "+" : "-"}${formatMoney(txn.amount)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-button" title="Edit transaction" data-edit="${txn.id}">E</button>
            <button class="icon-button danger" title="Delete transaction" data-delete="${txn.id}">D</button>
          </div>
        </td>
      </tr>
    `;
  }

  function miniTransactionRow(txn) {
    const amountClass = txn.direction === "income" ? "positive" : "negative";
    return `
      <div class="mini-row">
        <span>
          <strong>${escapeHtml(txn.description)}</strong><br>
          <span class="muted">${formatDate(txn.txn_date)} · ${escapeHtml(txn.categories?.name || "Uncategorized")}</span>
        </span>
        <strong class="${amountClass}">${txn.direction === "income" ? "+" : "-"}${formatMoney(txn.amount)}</strong>
      </div>
    `;
  }

  function renderBudgets() {
    const month = $("#budget-month").value || currentMonth();
    const spendingByCategory = new Map();
    state.transactions
      .filter((txn) => txn.direction === "expense" && monthKey(txn.txn_date) === month)
      .forEach((txn) => {
        if (!txn.category_id) return;
        spendingByCategory.set(txn.category_id, (spendingByCategory.get(txn.category_id) || 0) + Number(txn.amount));
      });

    const budgets = state.budgets.filter((budget) => budget.month === month);
    $("#budget-list").innerHTML = budgets.length
      ? budgets
          .map((budget) => {
            const spent = spendingByCategory.get(budget.category_id) || 0;
            const pct = Number(budget.amount) ? Math.min(100, (spent / Number(budget.amount)) * 100) : 0;
            const color = budget.categories?.color || "#0f766e";
            return `
              <div class="breakdown-item">
                <div class="breakdown-top">
                  <strong><span class="swatch" style="background:${escapeHtml(color)}"></span> ${escapeHtml(budget.categories?.name || "Category")}</strong>
                  <span>${formatMoney(spent)} / ${formatMoney(budget.amount)}</span>
                </div>
                <div class="bar"><span style="width:${pct}%;background:${escapeHtml(color)}"></span></div>
              </div>
            `;
          })
          .join("")
      : `<div class="empty">No budgets set for ${month}.</div>`;
  }

  function renderPlanned() {
    $("#planned-list").innerHTML = state.planned.length
      ? state.planned
          .map((item) => `
            <div class="mini-row">
              <span>
                <strong>${escapeHtml(item.title)}</strong><br>
                <span class="muted">${item.due_date ? formatDate(item.due_date) : "No due date"} · ${escapeHtml(item.categories?.name || "Uncategorized")}</span>
              </span>
              <span>
                <strong>${formatMoney(item.amount)}</strong><br>
                <button class="small secondary" data-plan-paid="${item.id}">${escapeHtml(item.status)}</button>
              </span>
            </div>
          `)
          .join("")
      : `<div class="empty">No planned expenses yet.</div>`;

    $$("[data-plan-paid]").forEach((button) => {
      button.addEventListener("click", () => togglePlannedStatus(button.dataset.planPaid));
    });
  }

  function renderSettings() {
    $("#category-list").innerHTML = state.categories
      .map((category) => `
        <div class="chip">
          <span><span class="swatch" style="background:${escapeHtml(category.color)}"></span> ${escapeHtml(category.name)}</span>
          <span class="pill">${escapeHtml(category.kind)}</span>
        </div>
      `)
      .join("");

    $("#rule-list").innerHTML = state.rules.length
      ? state.rules
          .map((rule) => `
            <div class="mini-row">
              <span><strong>${escapeHtml(rule.match_text)}</strong><br><span class="muted">${escapeHtml(rule.categories?.name || "")}</span></span>
              <button class="icon-button danger" title="Delete rule" data-rule-delete="${rule.id}">D</button>
            </div>
          `)
          .join("")
      : `<div class="empty">No auto-tag rules yet.</div>`;

    $$("[data-rule-delete]").forEach((button) => {
      button.addEventListener("click", () => deleteRule(button.dataset.ruleDelete));
    });
  }

  async function saveTransaction(event) {
    event.preventDefault();
    const id = $("#transaction-id").value;
    const row = {
      user_id: state.user.id,
      txn_date: $("#txn-date").value,
      description: $("#txn-description").value.trim(),
      amount: Number($("#txn-amount").value),
      direction: $("#txn-direction").value,
      category_id: $("#txn-category").value || null,
      account_name: $("#txn-account").value.trim() || "Primary",
      source: "Manual",
      notes: $("#txn-notes").value.trim() || null
    };
    row.fingerprint = id ? state.transactions.find((txn) => txn.id === id)?.fingerprint : await fingerprint(row);

    const query = id
      ? state.client.from("transactions").update(row).eq("id", id).eq("user_id", state.user.id)
      : state.client.from("transactions").insert(row);
    const { error } = await query;

    if (error) {
      showToast(error.message);
      return;
    }

    resetTransactionForm();
    await loadData();
    showToast("Transaction saved.");
  }

  function editTransaction(id) {
    const txn = state.transactions.find((item) => item.id === id);
    if (!txn) return;
    $("#transaction-id").value = txn.id;
    $("#txn-date").value = txn.txn_date;
    $("#txn-description").value = txn.description;
    $("#txn-amount").value = txn.amount;
    $("#txn-direction").value = txn.direction;
    $("#txn-category").value = txn.category_id || "";
    $("#txn-account").value = txn.account_name || "Primary";
    $("#txn-notes").value = txn.notes || "";
    switchView("transactions");
  }

  async function deleteTransaction(id) {
    if (!confirm("Delete this transaction?")) return;
    const { error } = await state.client.from("transactions").delete().eq("id", id).eq("user_id", state.user.id);
    if (error) {
      showToast(error.message);
      return;
    }
    await loadData();
    showToast("Transaction deleted.");
  }

  function resetTransactionForm() {
    $("#transaction-form").reset();
    $("#transaction-id").value = "";
    $("#txn-date").value = today();
    $("#txn-account").value = "Primary";
  }

  async function importStatement(event) {
    event.preventDefault();
    const file = $("#statement-file").files[0];
    if (!file) return;

    try {
      const source = $("#statement-source").value;
      const accountName = $("#import-account").value.trim() || source || "Primary";
      const rawRows = await readStatementFile(file);
      const parsed = await normalizeRows(rawRows, source, accountName);
      if (!parsed.length) {
        $("#import-result").innerHTML = `<div class="empty">No usable transactions found. Check the statement columns.</div>`;
        return;
      }

      const existing = await existingFingerprints(parsed.map((row) => row.fingerprint));
      const newRows = parsed.filter((row) => !existing.has(row.fingerprint));

      if (newRows.length) {
        const { error } = await state.client.from("transactions").insert(newRows);
        if (error) throw error;
      }

      $("#import-result").innerHTML = `
        <div class="chip">
          <span>Imported ${newRows.length} new transactions</span>
          <span class="pill">${parsed.length - newRows.length} skipped duplicates</span>
        </div>
      `;
      $("#import-form").reset();
      $("#import-account").value = "Primary";
      await loadData();
    } catch (error) {
      showToast(error.message || "Import failed.");
    }
  }

  async function readStatementFile(file) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv")) {
      return parseCsv(await file.text());
    }

    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      if (!window.XLSX) throw new Error("Excel parser did not load. Check your internet connection.");
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
    }

    throw new Error("Only CSV, XLSX, and XLS files are supported in this Vercel version.");
  }

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const cells = splitCsvLine(line);
      return headers.reduce((row, header, index) => {
        row[header] = cells[index] || "";
        return row;
      }, {});
    });
  }

  function splitCsvLine(line) {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  async function normalizeRows(rows, source, accountName) {
    if (!rows.length) return [];
    const headers = Object.keys(rows[0]);
    const map = buildColumnMap(headers);
    const normalized = [];

    for (const row of rows) {
      const txnDate = parseDate(rowValue(row, map.date));
      const description = String(rowValue(row, map.description) || "").trim();
      const debit = parseAmount(rowValue(row, map.debit));
      const credit = parseAmount(rowValue(row, map.credit));
      const amountRaw = parseAmount(rowValue(row, map.amount));
      const typeRaw = String(rowValue(row, map.type) || "").toLowerCase();
      const balance = parseAmount(rowValue(row, map.balance));

      if (!txnDate || !description) continue;

      let direction = null;
      let amount = 0;
      if (debit > 0 || credit > 0) {
        direction = credit > debit ? "income" : "expense";
        amount = Math.max(debit, credit);
      } else if (amountRaw > 0) {
        direction = /cr|credit|deposit|income|received/.test(typeRaw) ? "income" : "expense";
        amount = amountRaw;
      }

      if (!direction || !amount) continue;

      const categoryId = suggestCategory(description, direction);
      const transaction = {
        user_id: state.user.id,
        txn_date: txnDate,
        description,
        amount,
        direction,
        category_id: categoryId,
        account_name: accountName,
        source,
        balance: balance || null,
        raw: row
      };
      transaction.fingerprint = await fingerprint(transaction);
      normalized.push(transaction);
    }

    return normalized;
  }

  function buildColumnMap(headers) {
    const normalized = headers.map((header) => [header, normalizeHeader(header)]);
    const find = (kind) => {
      const aliases = columnAliases[kind];
      const match = normalized.find(([, header]) => aliases.some((alias) => header === normalizeHeader(alias) || header.includes(normalizeHeader(alias))));
      return match ? match[0] : null;
    };
    return {
      date: find("date"),
      description: find("description"),
      debit: find("debit"),
      credit: find("credit"),
      amount: find("amount"),
      type: find("type"),
      balance: find("balance")
    };
  }

  function rowValue(row, key) {
    return key ? row[key] : "";
  }

  async function existingFingerprints(fingerprints) {
    const found = new Set();
    const unique = Array.from(new Set(fingerprints));
    for (let i = 0; i < unique.length; i += 200) {
      const chunk = unique.slice(i, i + 200);
      const { data, error } = await state.client
        .from("transactions")
        .select("fingerprint")
        .eq("user_id", state.user.id)
        .in("fingerprint", chunk);
      if (error) throw error;
      data.forEach((row) => found.add(row.fingerprint));
    }
    return found;
  }

  async function saveCategory(event) {
    event.preventDefault();
    const row = {
      user_id: state.user.id,
      name: $("#category-name").value.trim(),
      kind: $("#category-kind").value,
      color: $("#category-color").value
    };
    const { error } = await state.client.from("categories").insert(row);
    if (error) {
      showToast(error.message);
      return;
    }
    $("#category-form").reset();
    $("#category-color").value = "#0f766e";
    await loadData();
  }

  async function saveBudget(event) {
    event.preventDefault();
    const row = {
      user_id: state.user.id,
      month: $("#budget-month").value,
      category_id: $("#budget-category").value,
      amount: Number($("#budget-amount").value)
    };
    const { error } = await state.client
      .from("monthly_budgets")
      .upsert(row, { onConflict: "user_id,month,category_id" });
    if (error) {
      showToast(error.message);
      return;
    }
    $("#budget-amount").value = "";
    await loadData();
  }

  async function savePlanned(event) {
    event.preventDefault();
    const row = {
      user_id: state.user.id,
      title: $("#planned-title").value.trim(),
      amount: Number($("#planned-amount").value),
      due_date: $("#planned-date").value || null,
      category_id: $("#planned-category").value || null
    };
    const { error } = await state.client.from("planned_expenses").insert(row);
    if (error) {
      showToast(error.message);
      return;
    }
    $("#planned-form").reset();
    await loadData();
  }

  async function togglePlannedStatus(id) {
    const item = state.planned.find((planned) => planned.id === id);
    if (!item) return;
    const status = item.status === "paid" ? "planned" : "paid";
    const { error } = await state.client
      .from("planned_expenses")
      .update({ status })
      .eq("id", id)
      .eq("user_id", state.user.id);
    if (error) {
      showToast(error.message);
      return;
    }
    await loadData();
  }

  async function saveRule(event) {
    event.preventDefault();
    const row = {
      user_id: state.user.id,
      match_text: $("#rule-text").value.trim().toLowerCase(),
      category_id: $("#rule-category").value,
      priority: state.rules.length + 10
    };
    const { error } = await state.client.from("tag_rules").insert(row);
    if (error) {
      showToast(error.message);
      return;
    }
    $("#rule-form").reset();
    await loadData();
  }

  async function deleteRule(id) {
    const { error } = await state.client.from("tag_rules").delete().eq("id", id).eq("user_id", state.user.id);
    if (error) {
      showToast(error.message);
      return;
    }
    await loadData();
  }

  function suggestCategory(description, direction) {
    const text = description.toLowerCase();
    const rule = state.rules.find((item) => text.includes(item.match_text.toLowerCase()));
    if (rule) return rule.category_id;
    const fallback = state.categories.find((category) => category.kind === direction && category.name === (direction === "income" ? "Refunds" : "Transfers"));
    return fallback ? fallback.id : null;
  }

  async function fingerprint(row) {
    const input = [
      state.user.id,
      row.txn_date,
      row.description.toLowerCase().replace(/\s+/g, " ").trim(),
      Number(row.amount).toFixed(2),
      row.direction,
      row.account_name || "",
      row.source || ""
    ].join("|");
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function parseAmount(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Math.abs(value);
    const text = String(value)
      .replace(/,/g, "")
      .replace(/₹/g, "")
      .replace(/\s/g, "")
      .replace(/cr$/i, "")
      .replace(/dr$/i, "");
    const negative = /^\(.+\)$/.test(text) || text.startsWith("-");
    const number = Number(text.replace(/[()]/g, ""));
    if (Number.isNaN(number)) return 0;
    return Math.abs(negative ? -number : number);
  }

  function parseDate(value) {
    if (!value) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === "number") {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      excelEpoch.setUTCDate(excelEpoch.getUTCDate() + value);
      return excelEpoch.toISOString().slice(0, 10);
    }

    const text = String(value).trim();
    const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

    const parts = text.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})/);
    if (parts) {
      const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
      return `${year}-${pad2(parts[2])}-${pad2(parts[1])}`;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  function normalizeHeader(header) {
    return String(header).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  }

  function categoryPill(category) {
    if (!category) return `<span class="pill">Uncategorized</span>`;
    return `<span class="pill"><span class="swatch" style="background:${escapeHtml(category.color)}"></span>${escapeHtml(category.name)}</span>`;
  }

  function setDefaultDates() {
    $("#txn-date").value = today();
    $("#budget-month").value = currentMonth();
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function currentMonth() {
    return today().slice(0, 7);
  }

  function monthKey(value) {
    return String(value).slice(0, 7);
  }

  function sum(values) {
    return values.reduce((total, value) => total + Number(value || 0), 0);
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function titleCase(value) {
    return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
  }
})();
