import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useImportJobs, type JobImportRow } from "@/hooks/useJobs";
import {
  guessColumnMapping,
  JOB_FIELD_KEYWORDS,
  normalizeJobStatus,
  parseCsv,
  parseDateLoose,
} from "@/lib/csv";
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
  clientMatch: "Client name (required — matches or creates a client)",
  clientEmail: "Client email (helps match more accurately)",
  title: "Job title",
  description: "Description",
  status: "Status",
  scheduledAt: "Scheduled date",
  address: "Job address",
  notes: "Notes",
};

export function ImportJobsDialog() {
  const { user } = useAuth();
  const importJobs = useImportJobs();
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
    setMapping(guessColumnMapping(headerRow, JOB_FIELD_KEYWORDS));
  }

  function columnIndex(header: string | null) {
    return header ? headers.indexOf(header) : -1;
  }

  function buildRows(): JobImportRow[] {
    const clientIdx = columnIndex(mapping.clientMatch);
    const emailIdx = columnIndex(mapping.clientEmail);
    const titleIdx = columnIndex(mapping.title);
    const descIdx = columnIndex(mapping.description);
    const statusIdx = columnIndex(mapping.status);
    const dateIdx = columnIndex(mapping.scheduledAt);
    const addressIdx = columnIndex(mapping.address);
    const notesIdx = columnIndex(mapping.notes);

    return dataRows.map((row) => ({
      clientName: clientIdx !== -1 ? row[clientIdx]?.trim() || "" : "",
      clientEmail: emailIdx !== -1 ? row[emailIdx]?.trim() || null : null,
      title: titleIdx !== -1 ? row[titleIdx]?.trim() || "" : "",
      description: descIdx !== -1 ? row[descIdx]?.trim() || null : null,
      status: normalizeJobStatus(statusIdx !== -1 ? row[statusIdx] : undefined),
      scheduledAt: dateIdx !== -1 ? parseDateLoose(row[dateIdx]) : null,
      address: addressIdx !== -1 ? row[addressIdx]?.trim() || null : null,
      notes: notesIdx !== -1 ? row[notesIdx]?.trim() || null : null,
    }));
  }

  async function handleImport() {
    if (!user) return;
    const rows = buildRows();
    setImporting(true);
    try {
      const { imported, skipped } = await importJobs.mutateAsync({ ownerId: user.id, rows });
      toast.success(
        `Imported ${imported} job${imported === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped — missing client name or title)` : ""}`,
      );
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
          <DialogTitle>Import jobs from CSV</DialogTitle>
        </DialogHeader>

        {headers.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Export your job list to CSV from Jobber (or any other tool) and upload it here. Each row
              needs a client name — if there's no matching client yet, one will be created
              automatically.
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
              {fileName} — {dataRows.length} row{dataRows.length === 1 ? "" : "s"} found.
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
            {importing ? "Importing…" : `Import ${dataRows.length || ""} job${dataRows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
