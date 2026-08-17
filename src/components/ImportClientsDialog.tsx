import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useImportClients } from "@/hooks/useClients";
import { guessColumnMapping, parseCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const NONE = "__none__";

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name (if there's no separate first/last)",
  company: "Company",
  email: "Email",
  phone: "Phone",
  address: "Address",
  notes: "Notes",
};

export function ImportClientsDialog() {
  const { user } = useAuth();
  const importClients = useImportClients();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [importing, setImporting] = useState(false);

  function reset() {
    setFileName("");
    setHeaders([]);
    setDataRows([]);
    setMapping({});
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      toast.error("That file doesn't look like it has any data rows.");
      reset();
      return;
    }
    const [headerRow, ...rest] = rows;
    setHeaders(headerRow);
    setDataRows(rest);
    setMapping(guessColumnMapping(headerRow));
  }

  function columnIndex(header: string | null) {
    if (!header) return -1;
    return headers.indexOf(header);
  }

  function buildRecords() {
    if (!user) return [];
    const firstIdx = columnIndex(mapping.firstName);
    const lastIdx = columnIndex(mapping.lastName);
    const fullIdx = columnIndex(mapping.fullName);
    const companyIdx = columnIndex(mapping.company);
    const emailIdx = columnIndex(mapping.email);
    const phoneIdx = columnIndex(mapping.phone);
    const addressIdx = columnIndex(mapping.address);
    const notesIdx = columnIndex(mapping.notes);

    return dataRows
      .map((row) => {
        const first = firstIdx !== -1 ? row[firstIdx]?.trim() : "";
        const last = lastIdx !== -1 ? row[lastIdx]?.trim() : "";
        const full = fullIdx !== -1 ? row[fullIdx]?.trim() : "";
        const company = companyIdx !== -1 ? row[companyIdx]?.trim() : "";

        const name = [first, last].filter(Boolean).join(" ") || full || company || "";
        if (!name) return null;

        const notesParts = [
          notesIdx !== -1 ? row[notesIdx]?.trim() : "",
          company && name !== company ? `Company: ${company}` : "",
        ].filter(Boolean);

        return {
          owner_id: user.id,
          name,
          email: emailIdx !== -1 ? row[emailIdx]?.trim() || null : null,
          phone: phoneIdx !== -1 ? row[phoneIdx]?.trim() || null : null,
          address: addressIdx !== -1 ? row[addressIdx]?.trim() || null : null,
          notes: notesParts.length > 0 ? notesParts.join(" — ") : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }

  async function handleImport() {
    const records = buildRecords();
    const skipped = dataRows.length - records.length;
    if (records.length === 0) {
      toast.error("No rows had a name to import — check your column mapping.");
      return;
    }
    setImporting(true);
    try {
      const imported = await importClients.mutateAsync(records);
      toast.success(`Imported ${imported} client${imported === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped — no name)` : ""}`);
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import clients from CSV</DialogTitle>
        </DialogHeader>

        {headers.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Export your client list to CSV from Jobber (or any other tool — spreadsheets work too) and
              upload it here. You'll get to match up the columns before anything is imported.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {fileName} — {dataRows.length} row{dataRows.length === 1 ? "" : "s"} found. Match each field
              below to a column, or leave it as "Don't import."
            </p>

            <div className="grid grid-cols-2 gap-3">
              {Object.entries(FIELD_LABELS).map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs">{label}</Label>
                  <Select
                    value={mapping[field] ?? NONE}
                    onValueChange={(v) => setMapping({ ...mapping, [field]: v === NONE ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Don't import</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div>
              <Label className="text-xs">Preview (first 3 rows)</Label>
              <div className="mt-1.5 max-h-40 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataRows.slice(0, 3).map((row, i) => (
                      <TableRow key={i}>
                        {row.map((cell, j) => (
                          <TableCell key={j}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {headers.length > 0 && (
            <Button variant="outline" onClick={reset} disabled={importing}>
              Choose a different file
            </Button>
          )}
          <Button onClick={handleImport} disabled={headers.length === 0 || importing}>
            {importing ? "Importing…" : `Import ${dataRows.length || ""} contact${dataRows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
