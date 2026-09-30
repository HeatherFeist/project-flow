import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCopy, ExternalLink, Loader2, Plus, Search, SquareArrowOutUpRight, Store } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateMaterial } from "@/hooks/useMaterials";
import { useSearchHomeDepot, type HomeDepotProduct } from "@/hooks/useHomeDepotSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

// Searches Home Depot's catalog via the owner's own SerpApi key
// (Settings) and lets them add a result straight into Materials — same
// end result as typing it in by hand, minus the retyping and with
// today's real price.
export function HomeDepotSearchDialog() {
  const { user } = useAuth();
  const search = useSearchHomeDepot();
  const createMaterial = useCreateMaterial();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HomeDepotProduct[] | null>(null);
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());

  const selectableResults = (results ?? []).filter((p) => !!p.productUrl);
  const allSelected = selectableResults.length > 0 && selectableResults.every((p) => selectedUrls.has(p.productUrl!));

  function toggleSelected(url: string) {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(selectableResults.map((p) => p.productUrl!)));
    }
  }

  function handleOpenSelected() {
    if (selectedUrls.size === 0) return;
    // Most browsers only allow one or two window.open() calls per click
    // before treating the rest as popups and blocking them — staggering
    // them slightly (still well within the same user gesture window in
    // most browsers) gets noticeably more of them through than firing
    // all at once. Worth telling the user to allow popups either way.
    let i = 0;
    for (const url of selectedUrls) {
      setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), i * 120);
      i++;
    }
    toast.info(
      `Opening ${selectedUrls.size} product page${selectedUrls.size === 1 ? "" : "s"} — if your browser blocks some as popups, allow popups for this site and try again.`,
    );
  }

  // Home Depot has no public way for an outside app to add multiple items
  // to a real homedepot.com cart at once — clicking straight through often
  // trips their own bot-detection ("Access Denied") anyway. This is the
  // practical workaround: a plain text list (name, model #, price) copied
  // to the clipboard, ready to paste into Home Depot's own search box one
  // at a time (searching from their own site avoids the block entirely),
  // or to text/share with whoever's actually doing the shopping.
  function handleCopyList() {
    const selected = (results ?? []).filter((p) => p.productUrl && selectedUrls.has(p.productUrl));
    if (selected.length === 0) return;
    const lines = selected.map((p) => {
      const price = p.priceCents !== null ? formatCurrency(p.priceCents) : "price unavailable";
      const model = p.modelNumber ? ` — Model ${p.modelNumber}` : "";
      return `${p.title}${model} — ${price}`;
    });
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success(`Copied ${selected.length} item${selected.length === 1 ? "" : "s"} to your clipboard`);
  }

  // Saves every selected result to Materials in one go — a "bundle" you
  // build in-app, since there's no way to hand a real cart over to Home
  // Depot's own site.
  async function handleAddAllSelected() {
    if (!user) return;
    const selected = (results ?? []).filter((p) => p.productUrl && selectedUrls.has(p.productUrl));
    let added = 0;
    for (const product of selected) {
      try {
        await createMaterial.mutateAsync({
          owner_id: user.id,
          name: product.title,
          category: null,
          supplier: "Home Depot",
          sku: product.modelNumber ?? product.itemId,
          unit: "each",
          cost_cents: product.priceCents ?? 0,
          product_url: product.productUrl,
          image_url: product.imageUrl ?? null,
          notes: null,
        });
        if (product.productUrl) setAddedUrls((prev) => new Set(prev).add(product.productUrl!));
        added++;
      } catch {
        // Keep going — report the count that actually succeeded below.
      }
    }
    if (added > 0) toast.success(`Added ${added} item${added === 1 ? "" : "s"} to Materials`);
    if (added < selected.length) toast.error(`${selected.length - added} item(s) failed to add — try those individually.`);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const products = await search.mutateAsync(query.trim());
      setResults(products);
      setSelectedUrls(new Set());
      if (products.length === 0) toast.info("No results found.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    }
  }

  async function handleAdd(product: HomeDepotProduct) {
    if (!user) return;
    try {
      await createMaterial.mutateAsync({
        owner_id: user.id,
        name: product.title,
        category: null,
        supplier: "Home Depot",
        sku: product.modelNumber ?? product.itemId,
        unit: "each",
        cost_cents: product.priceCents ?? 0,
        product_url: product.productUrl,
        image_url: product.imageUrl ?? null,
        notes: null,
      });
      if (product.productUrl) setAddedUrls((prev) => new Set(prev).add(product.productUrl!));
      toast.success(`Added "${product.title}" to Materials`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add material");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResults(null);
          setQuery("");
          setAddedUrls(new Set());
          setSelectedUrls(new Set());
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Store /> Search Home Depot
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search Home Depot</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 1/2 in. PVC elbow"
            autoFocus
          />
          <Button type="submit" disabled={search.isPending || !query.trim()}>
            {search.isPending ? <Loader2 className="animate-spin" /> : <Search />}
            Search
          </Button>
        </form>

        {results && results.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              Select all
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={selectedUrls.size === 0} onClick={handleAddAllSelected}>
                <Plus /> Add {selectedUrls.size || ""} to Materials
              </Button>
              <Button size="sm" variant="outline" disabled={selectedUrls.size === 0} onClick={handleCopyList}>
                <ClipboardCopy /> Copy list
              </Button>
              <Button size="sm" variant="outline" disabled={selectedUrls.size === 0} onClick={handleOpenSelected}>
                <SquareArrowOutUpRight /> Open on homedepot.com
              </Button>
            </div>
          </div>
        )}

        {results && (
          <div className="max-h-96 space-y-2 overflow-auto">
            {results.length === 0 && (
              <p className="text-sm text-muted-foreground">No results — try a different search term.</p>
            )}
            {results.map((product, i) => {
              const alreadyAdded = product.productUrl ? addedUrls.has(product.productUrl) : false;
              const isSelected = product.productUrl ? selectedUrls.has(product.productUrl) : false;
              return (
                <div key={i} className="flex items-center gap-3 rounded-md border p-2">
                  {product.productUrl && (
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSelected(product.productUrl!)} />
                  )}
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="size-14 shrink-0 rounded object-contain" />
                  ) : (
                    <div className="flex size-14 shrink-0 items-center justify-center rounded bg-muted">
                      <Store className="size-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.priceCents !== null ? formatCurrency(product.priceCents) : "Price unavailable"}
                      {product.modelNumber ? ` · Model ${product.modelNumber}` : ""}
                    </p>
                  </div>
                  {product.productUrl && (
                    <a
                      href={product.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      title="View on homedepot.com"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant={alreadyAdded ? "secondary" : "default"}
                    disabled={createMaterial.isPending || alreadyAdded}
                    onClick={() => handleAdd(product)}
                  >
                    {alreadyAdded ? "Added" : <><Plus /> Add</>}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
