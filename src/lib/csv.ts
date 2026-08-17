// Minimal, dependency-free CSV parser that handles quoted fields (commas
// and newlines inside quotes, escaped quotes as "") — enough for exports
// from Jobber, Excel, Google Sheets, etc.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // skip; \r\n handled by the following \n
    } else {
      field += char;
    }
  }

  // Trailing field/row (files not ending in a newline).
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export const CLIENT_FIELD_KEYWORDS: Record<string, string[]> = {
  firstName: ["first name", "given name", "first"],
  lastName: ["last name", "surname", "family name", "last"],
  fullName: ["full name", "name", "client name", "customer name", "contact name"],
  company: ["company", "company name", "business name", "organization"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "phone number", "mobile", "cell", "primary phone", "telephone"],
  address: ["address", "billing address", "street address", "service address", "billing street"],
  notes: ["notes", "note", "comments", "description"],
};

export const JOB_FIELD_KEYWORDS: Record<string, string[]> = {
  clientMatch: ["client", "client name", "customer", "customer name"],
  clientEmail: ["client email", "customer email", "email"],
  title: ["title", "job title", "job name", "summary"],
  description: ["description", "details", "job description"],
  status: ["status", "job status"],
  scheduledAt: ["date", "scheduled date", "job date", "start date", "scheduled", "appointment date"],
  address: ["address", "job address", "service address", "site address"],
  notes: ["notes", "note", "comments"],
};

export const QUOTE_FIELD_KEYWORDS: Record<string, string[]> = {
  clientMatch: ["client", "client name", "customer", "customer name"],
  clientEmail: ["client email", "customer email", "email"],
  description: ["description", "line item", "item", "service"],
  status: ["status", "quote status"],
  total: ["total", "amount", "price", "quote total", "estimate total", "grand total"],
  notes: ["notes", "note", "comments"],
  date: ["date", "quote date", "created date", "sent date"],
};

export function guessColumnMapping(headers: string[], fieldKeywords: Record<string, string[]> = CLIENT_FIELD_KEYWORDS) {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const mapping: Record<string, string | null> = {};
  for (const field of Object.keys(fieldKeywords)) mapping[field] = null;

  for (const [field, keywords] of Object.entries(fieldKeywords)) {
    const idx = normalized.findIndex((h) => keywords.includes(h));
    if (idx !== -1) {
      mapping[field] = headers[idx];
      continue;
    }
    const fuzzyIdx = normalized.findIndex((h) => keywords.some((k) => h.includes(k)));
    if (fuzzyIdx !== -1) mapping[field] = headers[fuzzyIdx];
  }

  return mapping;
}

/** Best-effort "$1,234.56" / "1234.56" -> cents. Returns null if unparseable. */
export function parseCurrencyToCents(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

/** Best-effort date parse; returns an ISO string or null. */
export function parseDateLoose(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeJobStatus(raw: string | undefined): "scheduled" | "in_progress" | "completed" | "cancelled" {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("complet") || s.includes("done") || s.includes("closed")) return "completed";
  if (s.includes("progress") || s.includes("active") || s.includes("late")) return "in_progress";
  return "scheduled";
}

export function normalizeQuoteStatus(raw: string | undefined): "draft" | "sent" | "accepted" | "declined" {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("approve") || s.includes("accept") || s.includes("convert") || s.includes("won")) return "accepted";
  if (s.includes("declin") || s.includes("reject") || s.includes("archiv") || s.includes("lost")) return "declined";
  if (s.includes("sent") || s.includes("awaiting") || s.includes("pending")) return "sent";
  return "draft";
}

export const PRICE_HISTORY_FIELD_KEYWORDS: Record<string, string[]> = {
  itemName: ["item", "line item", "service", "product", "description", "item name"],
  category: ["category", "type", "job type", "service type"],
  amount: ["amount", "price", "total", "unit price", "line total", "amount charged", "rate"],
  quantity: ["quantity", "qty", "hours"],
};

interface PriceHistoryEntry {
  itemName: string;
  category: string | null;
  amountCents: number;
}

export interface PriceHistoryGroup {
  itemName: string;
  category: string;
  lowCents: number;
  highCents: number;
  occurrences: number;
}

/**
 * Groups raw invoice/price-book CSV rows (one row per line item) by
 * normalized item name and turns each group into a real price range —
 * min/max of what was actually charged. A single-occurrence item gets a
 * modest +/-10% padding instead of a zero-width range, since one data
 * point isn't really a "range" yet.
 */
export function groupPriceHistory(entries: PriceHistoryEntry[]): PriceHistoryGroup[] {
  const groups = new Map<string, { itemName: string; category: string | null; amounts: number[] }>();

  for (const entry of entries) {
    const name = entry.itemName.trim();
    if (!name || entry.amountCents == null || Number.isNaN(entry.amountCents)) continue;
    const key = name.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.amounts.push(entry.amountCents);
      if (!existing.category && entry.category) existing.category = entry.category;
    } else {
      groups.set(key, { itemName: name, category: entry.category, amounts: [entry.amountCents] });
    }
  }

  const result: PriceHistoryGroup[] = [];
  for (const g of groups.values()) {
    const min = Math.min(...g.amounts);
    const max = Math.max(...g.amounts);
    const lowCents = g.amounts.length === 1 ? Math.round(min * 0.9) : min;
    const highCents = g.amounts.length === 1 ? Math.round(max * 1.1) : max;
    result.push({
      itemName: g.itemName,
      category: g.category?.trim() || "Imported",
      lowCents,
      highCents,
      occurrences: g.amounts.length,
    });
  }

  return result.sort((a, b) => a.category.localeCompare(b.category) || a.itemName.localeCompare(b.itemName));
}

/** Looks up an existing client id by email (preferred) or exact name match. */
export interface ClientLookup {
  byEmail: Map<string, string>;
  byName: Map<string, string>;
}

export function buildClientLookup(clients: { id: string; name: string; email: string | null }[]): ClientLookup {
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of clients) {
    if (c.email) byEmail.set(c.email.trim().toLowerCase(), c.id);
    byName.set(c.name.trim().toLowerCase(), c.id);
  }
  return { byEmail, byName };
}

export function matchClientId(lookup: ClientLookup, name: string, email: string | null): string | null {
  if (email) {
    const byEmail = lookup.byEmail.get(email.trim().toLowerCase());
    if (byEmail) return byEmail;
  }
  if (name) {
    const byName = lookup.byName.get(name.trim().toLowerCase());
    if (byName) return byName;
  }
  return null;
}
