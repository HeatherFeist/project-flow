import { useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useImportPriceHistory } from "@/hooks/usePriceBook";
import {
  groupPriceHistory,
  guessColumnMapping,
  parseCsv,
  parseCurrencyToCents,
  PRICE_HISTORY_FIELD_KEYWORDS,
  type PriceHistoryGroup,
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
import { formatCurrency } from "@/lib/utils";

const NONE = "__none__";

const FIELD_LABELS: Record<string, string> = {
  itemName: "Item / service (required — rows are grouped by this)",
  category: "Category",
  amount: "Amount charged (required)",
};

export function ImportPriceHistoryDialog() {
  const { user } = useAuth();
  const importHistory = useImportPriceHistory();
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
    setMapping(guessColumnMapping(headerRow, PRICE_HISTORY_FIELD_KEYWORDS));
  }

  function columnIndex(header: string | null) {
    return header ? headers.indexOf(header) : -1;
  }

  function buildGroups(): PriceHistoryGroup[] {
    const nameIdx = columnIndex(mapping.itemName);
    const categoryIdx = columnIndex(mapping.category);
    const amountIdx = columnIndex(mapping.amount);
    if (nameIdx === -1 || amountIdx === -1) return [];

    const entries = dataRows
      .map((row) => ({
        itemName: row[nameIdx]?.trim() || "",
        category: categoryIdx !== -1 ? row[categoryIdx]?.trim() || null : null,
        amountCents: parseCurrencyToCents(row[amountIdx]),
      }))
      .filter((e) => e.itemName && e.amountCents !== null) as {
      itemName: string;
      category: string | null;
      amountCents: number;
    }[];

    return groupPriceHistory(entries);
  }

  const preview = headers.length > 0 && mapping.itemName && mapping.amount ? buildGroups() : [];

  async function handleImport() {
    if (!user) return;
    const groups = buildGroups();
    if (groups.length === 0) {
      toast.error("Nothing to import — check the item and amount column mapping.");
      return;
    }
    setImporting(true);
    try {
      const count = await importHistory.mutateAsync({ ownerId: user.id, groups });
      toast.success(`Imported ${count} price book item${count === 1 ? "" : "s"} from your pricing history`);
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
          <History /> Import from past invoices
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import real pricing history</DialogTitle>
        </DialogHeader>

        {headers.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Export your invoices or price list from Jobber (or any tool) as CSV — ideally with one row
              per line item, not just one row per invoice total. Rows with the same item/service name are
              grouped together and turned into a price range using the actual low/high amounts you've
              charged, so the chatbot quotes based on real history instead of a generic guess.
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
              <Label className="text-xs">
                Preview — {preview.length} price book item{preview.length === 1 ? "" : "s"} after grouping
              </Label>
              <div className="mt-1.5 max-h-52 overflow-auto rounded-md border">
                {preview.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    Map "Item / service" and "Amount charged" above to see a preview.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Range</TableHead>
                        <TableHead>From</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.slice(0, 20).map((g) => (
                        <TableRow key={g.itemName}>
                          <TableCell className="text-muted-foreground">{g.category}</TableCell>
                          <TableCell className="font-medium">{g.itemName}</TableCell>
                          <TableCell>
                            {formatCurrency(g.lowCents)} – {formatCurrency(g.highCents)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {g.occurrences} invoice{g.occurrences === 1 ? "" : "s"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
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
          <Button onClick={handleImport} disabled={preview.length === 0 || importing}>
            {importing ? "Importing…" : `Import ${preview.length || ""} item${preview.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
