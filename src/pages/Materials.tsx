import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCreateMaterial,
  useDeleteMaterial,
  useMaterials,
  useUpdateMaterial,
} from "@/hooks/useMaterials";
import type { Material } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteButton } from "@/components/DeleteButton";
import { ImportMaterialsDialog } from "@/components/ImportMaterialsDialog";
import { HomeDepotSearchDialog } from "@/components/HomeDepotSearchDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

const EMPTY_FORM = {
  name: "",
  category: "",
  supplier: "",
  sku: "",
  unit: "each",
  cost: "",
  product_url: "",
  notes: "",
};

export default function Materials() {
  const { user } = useAuth();
  const { data: materials, isLoading, error } = useMaterials(user?.id);
  const createMaterial = useCreateMaterial();
  const updateMaterial = useUpdateMaterial();
  const deleteMaterial = useDeleteMaterial();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials ?? [];
    return (materials ?? []).filter((m) =>
      [m.name, m.category, m.supplier, m.sku].some((field) => field?.toLowerCase().includes(q)),
    );
  }, [materials, search]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(material: Material) {
    setEditing(material);
    setForm({
      name: material.name,
      category: material.category ?? "",
      supplier: material.supplier ?? "",
      sku: material.sku ?? "",
      unit: material.unit,
      cost: (material.cost_cents / 100).toString(),
      product_url: material.product_url ?? "",
      notes: material.notes ?? "",
    });
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const payload = {
      name: form.name,
      category: form.category || null,
      supplier: form.supplier || null,
      sku: form.sku || null,
      unit: form.unit || "each",
      cost_cents: Math.round(Number(form.cost) * 100),
      product_url: form.product_url || null,
      notes: form.notes || null,
    };
    try {
      if (editing) {
        await updateMaterial.mutateAsync({ id: editing.id, owner_id: user.id, ...payload });
        toast.success("Material updated");
      } else {
        await createMaterial.mutateAsync({ owner_id: user.id, ...payload });
        toast.success("Material added");
      }
      setForm(EMPTY_FORM);
      setEditing(null);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save material");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Materials</h1>
          <p className="text-muted-foreground">
            What you pay for supplies — separate from the Price Book, which is what you charge customers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HomeDepotSearchDialog />
          <ImportMaterialsDialog />
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus /> Add material
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit material" : "Add material"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Product name</Label>
                  <Input
                    id="name"
                    required
                    placeholder='1/2" PEX pipe, 100ft'
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      placeholder="Plumbing"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier">Supplier / store</Label>
                    <Input
                      id="supplier"
                      placeholder="Home Depot"
                      value={form.supplier}
                      onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sku">SKU / item #</Label>
                    <Input
                      id="sku"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="unit">Unit</Label>
                    <Input
                      id="unit"
                      placeholder="each"
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cost">Cost ($)</Label>
                    <Input
                      id="cost"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product_url">Product page URL (optional)</Label>
                  <Input
                    id="product_url"
                    type="url"
                    placeholder="https://www.homedepot.com/p/..."
                    value={form.product_url}
                    onChange={(e) => setForm({ ...form, product_url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the product page link so reordering later is one click.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMaterial.isPending || updateMaterial.isPending}>
                    {createMaterial.isPending || updateMaterial.isPending
                      ? "Saving…"
                      : editing
                        ? "Save changes"
                        : "Add material"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Couldn't load materials: {error.message}. This usually means{" "}
          <code>docs/schema_v19_materials.sql</code> hasn't been run in Supabase yet.
        </p>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search materials by name, category, supplier, SKU…"
          className="pl-8"
        />
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (materials ?? []).length === 0 && !error && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No materials yet. Add one, or import a purchase-history CSV from Home Depot/Lowe's.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (materials ?? []).length > 0 && filteredMaterials.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No materials match "{search}".
                  </TableCell>
                </TableRow>
              )}
              {filteredMaterials.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground">{m.category ?? "—"}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {m.name}
                      {m.product_url && (
                        <a
                          href={m.product_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Open product page"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{m.supplier ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{m.sku ?? "—"}</TableCell>
                  <TableCell>
                    {formatCurrency(m.cost_cents)} / {m.unit}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" title="Edit material" onClick={() => openEdit(m)}>
                        <Pencil className="size-4" />
                      </Button>
                      <DeleteButton
                        itemLabel={m.name}
                        onConfirm={async () => {
                          try {
                            await deleteMaterial.mutateAsync(m.id);
                            toast.success("Material deleted");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to delete material");
                          }
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
