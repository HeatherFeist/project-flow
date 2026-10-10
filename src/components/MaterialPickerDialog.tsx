import { useMemo, useState } from "react";
import { Search, Store } from "lucide-react";
import { useMaterials } from "@/hooks/useMaterials";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import type { Material } from "@/types/domain";

interface Props {
  ownerId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (material: Material) => void;
}

// Lets a product reference for a visualization come straight from the
// Materials catalog — e.g. the real photo already saved from a Home
// Depot search — instead of needing to re-save or re-photograph the same
// product. Only shows materials that actually have a photo, since that's
// the whole point here.
export function MaterialPickerDialog({ ownerId, open, onOpenChange, onSelect }: Props) {
  const { data: materials } = useMaterials(ownerId);
  const [search, setSearch] = useState("");

  const withPhotos = useMemo(() => (materials ?? []).filter((m) => !!m.image_url), [materials]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return withPhotos;
    return withPhotos.filter((m) => [m.name, m.category, m.supplier].some((f) => f?.toLowerCase().includes(q)));
  }, [withPhotos, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a product from Materials</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials…"
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-96 space-y-1 overflow-auto">
          {withPhotos.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No materials with a saved photo yet — add one via "Search Home Depot" on the Materials page, or
              upload a photo directly here instead.
            </p>
          )}
          {withPhotos.length > 0 && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No matches for "{search}".</p>
          )}
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onSelect(m);
                onOpenChange(false);
              }}
              className="flex w-full items-center gap-3 rounded-md border p-2 text-left hover:bg-accent"
            >
              {m.image_url ? (
                <img src={m.image_url} alt="" className="size-12 shrink-0 rounded border object-contain" />
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded border bg-muted">
                  <Store className="size-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(m.cost_cents)}
                  {m.supplier ? ` · ${m.supplier}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
