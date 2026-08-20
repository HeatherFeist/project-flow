import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useImportMaterials, type MaterialImportRow } from "@/hooks/useMaterials";
import { guessColumnMapping, MATERIALS_FIELD_KEYWORDS, parseCsv, parseCurrencyToCents } from "@/lib/csv";
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
  name: "Product name (required)",
  category: "Category",
  supplier: "Supplier / store",
  sku: "SKU / item #",
  unit: "Unit (each, box, ft…)",
  cost: "Cost (required)",
  productUrl: "Product page URL",
};

export function ImportMaterialsDialog() {
  const { user } = useAuth();
  const importMaterials = useImportMaterials();
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
    setMapping(guessColumnMapping(headerRow, MATERIALS_FIELD_KEYWORDS));
  }

  function columnIndex(header: string | null) {
    return header ? headers.indexOf(header) : -1;
  }

  function buildRows(): MaterialImportRow[] {
    const nameIdx = columnIndex(mapping.name);
    const categoryIdx = columnIndex(mapping.category);
    const supplierIdx = columnIndex(mapping.supplier);
    const skuIdx = columnIndex(mapping.sku);
    const unitIdx = columnIndex(mapping.unit);
    const costIdx = columnIndex(mapping.cost);
    const urlIdx = columnIndex(mapping.productUrl);

    return dataRows.map((row) => ({
      name: nameIdx !== -1 ? row[nameIdx]?.trim() || "" : "",
      category: categoryIdx !== -1 ? row[categoryIdx]?.trim() || null : null,
      supplier: supplierIdx !== -1 ? row[supplierIdx]?.trim() || null : null,
      sku: skuIdx !== -1 ? row[skuIdx]?.trim() || null : null,
      unit: unitIdx !== -1 ? row[unitIdx]?.trim() || "each" : "each",
      costCents: costIdx !== -1 ? parseCurrencyToCents(row[costIdx]) : null,
      productUrl: urlIdx !== -1 ? row[urlIdx]?.trim() || null : null,
    }));
  }

  async function handleImport() {
    if (!user) return;
    const rows = buildRows();
    setImporting(true);
    try {
      const { imported, skipped } = await importMaterials.mutateAsync({ ownerId: user.id, rows });
      toast.success(
        `Imported ${imported} material${imported === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped — missing name or cost)` : ""}`,
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
          <DialogTitle>Import materials from CSV</DialogTitle>
        </DialogHeader>

        {headers.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Export your purchase history from a Home Depot Pro Xtra or Lowe's Pro account (or any
              supplier), and upload it here — one row per product. Include a SKU/item # and product URL
              column if you have them, so you can reorder the exact item later with one click.
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
            {importing ? "Importing…" : `Import ${dataRows.length || ""} item${dataRows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
