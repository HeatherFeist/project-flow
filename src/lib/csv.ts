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

const FIELD_KEYWORDS: Record<string, string[]> = {
  firstName: ["first name", "given name", "first"],
  lastName: ["last name", "surname", "family name", "last"],
  fullName: ["full name", "name", "client name", "customer name", "contact name"],
  company: ["company", "company name", "business name", "organization"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "phone number", "mobile", "cell", "primary phone", "telephone"],
  address: ["address", "billing address", "street address", "service address", "billing street"],
  notes: ["notes", "note", "comments", "description"],
};

export function guessColumnMapping(headers: string[]) {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const mapping: Record<string, string | null> = {
    firstName: null,
    lastName: null,
    fullName: null,
    company: null,
    email: null,
    phone: null,
    address: null,
    notes: null,
  };

  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
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
