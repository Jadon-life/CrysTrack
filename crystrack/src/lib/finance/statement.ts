import { dateKeyForInstant } from "@/lib/reminders";
import { toKobo, fromKobo } from "@/lib/money";
import { merchantCategory } from "./logic";
export interface StatementRow {
  flowKind: "income" | "expense";
  amount: string;
  date: string;
  source: string;
  category: string;
  note: string;
  accountId: string;
  importKey: string;
  duplicate: boolean;
  selected: boolean;
}
/** RFC 4180 quoted cells, CRLF, BOM, embedded commas/newlines, escaped quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [],
    row: string[] = [];
  let value = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (!quoted && value.length) throw new Error("Check CSV quoting.");
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push([...row]);
      row.length = 0;
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("A quoted CSV cell is incomplete.");
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
/** Stable content fingerprint (not a security token). Database uniqueness also blocks concurrent/repeated imports. */
export function statementKey(row: {
  date?: string;
  flowKind: string;
  amount: string;
  source?: string;
}) {
  const text = [
    row.date?.slice(0, 10),
    row.flowKind,
    fromKobo(toKobo(row.amount)),
    row.source?.trim().toLowerCase(),
  ].join("|");
  let a = 2166136261,
    b = 5381;
  for (const c of text) {
    a = Math.imul(a ^ c.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ c.charCodeAt(0);
  }
  return `csv-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}
export function statementPreview(
  text: string,
  accountId: string,
  existing: {
    amount: string;
    date: string;
    source?: string | null;
    flow_kind?: string;
    type?: string;
    account_id?: string | null;
    import_key?: string | null;
  }[],
  timezone = "UTC",
): StatementRow[] {
  const [headers, ...body] = parseCSV(text);
  if (!headers) throw new Error("Choose a CSV with a header row.");
  const keys = headers.map((v) => v.trim().toLowerCase().replace(/[ _-]/g, ""));
  const index = (...names: string[]) =>
    keys.findIndex((k) => names.includes(k));
  const date = index("date", "transactiondate"),
    amount = index("amount"),
    debit = index("debit", "withdrawal"),
    credit = index("credit", "deposit"),
    description = index("description", "narration", "source", "note"),
    type = index("type", "direction"),
    category = index("category");
  if (date < 0 || description < 0 || (amount < 0 && (debit < 0 || credit < 0)))
    throw new Error(
      "Use Date, Description, Amount, Type (income/expense), or Date, Description, Debit, Credit. Dates must be YYYY-MM-DD.",
    );
  if (body.length > 500) throw new Error("Import up to 500 rows at a time.");
  const seen = new Set(
    existing
      .filter((e) => e.account_id === accountId)
      .map(
        (e) =>
          e.import_key ||
          statementKey({
            date: dateKeyForInstant(new Date(e.date), timezone),
            amount: String(e.amount),
            source: e.source || "",
            flowKind: e.flow_kind || e.type || "",
          }),
      ),
  );
  return body.map((cells, i) => {
    const localDay = cells[date]?.trim();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(localDay) ||
      Number.isNaN(Date.parse(localDay)) ||
      new Date(localDay + "T00:00:00Z").toISOString().slice(0, 10) !== localDay
    )
      throw new Error(`Row ${i + 2}: use a valid YYYY-MM-DD date.`);
    const clean = (v: string | undefined) =>
      (v || "").trim().replace(/[,₦\s]/g, "");
    let raw = clean(cells[amount]),
      flowKind: "income" | "expense" = "expense";
    if (amount >= 0) {
      const kind = cells[type]?.trim().toLowerCase();
      if (raw.startsWith("-")) {
        raw = raw.slice(1);
      } else if (kind === "income" || kind === "credit") flowKind = "income";
      else if (kind !== "expense" && kind !== "debit")
        throw new Error(`Row ${i + 2}: choose income or expense.`);
    } else {
      const d = clean(cells[debit]),
        c = clean(cells[credit]);
      if (d && c && toKobo(d) > BigInt(0) && toKobo(c) > BigInt(0))
        throw new Error(`Row ${i + 2}: use one debit or credit.`);
      flowKind = c && toKobo(c) > BigInt(0) ? "income" : "expense";
      raw = flowKind === "income" ? c : d;
    }
    const n = toKobo(raw);
    if (n <= BigInt(0))
      throw new Error(`Row ${i + 2}: amount must be positive.`);
    const source = cells[description]?.trim() || "Statement entry",
      row = {
        date: localDay,
        flowKind,
        amount: fromKobo(n),
        source,
        category:
          cells[category]?.trim() || merchantCategory(source) || "Other",
        note: "Imported statement",
        accountId,
        importKey: "",
      };
    row.importKey = statementKey(row);
    const duplicate = seen.has(row.importKey);
    seen.add(row.importKey);
    return { ...row, duplicate, selected: !duplicate };
  });
}
export function exportCSV(entries: Record<string, unknown>[]) {
  const fields = [
    "id",
    "date",
    "flow_kind",
    "amount",
    "source",
    "category",
    "note",
    "account_id",
    "destination_account_id",
    "target_id",
    "parent_entry_id",
    "debt_id",
    "expected_flow_id",
    "bill_id",
    "bill_due_on",
    "deleted_at",
    "revision",
  ];
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    fields.map(cell).join(","),
    ...entries.map((e) => fields.map((k) => cell(e[k])).join(",")),
  ].join("\r\n");
}
