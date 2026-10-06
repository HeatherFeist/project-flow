import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, RotateCw, Search } from "lucide-react";
import { useFetchStreetView, type StreetViewImage } from "@/hooks/useStreetView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAddress?: string;
  onUse: (image: StreetViewImage, previewUrl: string) => void;
}

// Lets an exterior "before" photo for a visualization come from Google
// Street View's real street-level imagery for an address, instead of
// requiring an in-person photo first — see useStreetView.ts for why this
// is Street View and not satellite/aerial imagery.
export function StreetViewDialog({ open, onOpenChange, defaultAddress, onUse }: Props) {
  const fetchStreetView = useFetchStreetView();
  const [address, setAddress] = useState(defaultAddress ?? "");
  const [heading, setHeading] = useState<number | null>(null);
  const [preview, setPreview] = useState<StreetViewImage | null>(null);

  async function load(nextHeading?: number) {
    if (!address.trim()) return;
    try {
      const image = await fetchStreetView.mutateAsync({
        address: address.trim(),
        heading: nextHeading ?? undefined,
      });
      setPreview(image);
      setHeading(nextHeading ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Street View photo");
    }
  }

  function rotate(delta: number) {
    const next = ((heading ?? 0) + delta + 360) % 360;
    load(next);
  }

  function handleUse() {
    if (!preview) return;
    const bytes = Uint8Array.from(atob(preview.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: preview.mimeType });
    onUse(preview, URL.createObjectURL(blob));
    onOpenChange(false);
    setPreview(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Use a Street View photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sv-address">Address</Label>
            <div className="flex gap-2">
              <Input
                id="sv-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Dayton, OH"
              />
              <Button type="button" disabled={!address.trim() || fetchStreetView.isPending} onClick={() => load()}>
                {fetchStreetView.isPending ? <Loader2 className="animate-spin" /> : <Search />}
              </Button>
            </div>
          </div>

          {preview && (
            <div className="space-y-2">
              <img
                src={`data:${preview.mimeType};base64,${preview.base64}`}
                alt="Street View preview"
                className="w-full rounded-md border"
              />
              <div className="flex items-center justify-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={fetchStreetView.isPending} onClick={() => rotate(-45)}>
                  <RotateCcw className="size-3.5" /> Rotate left
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={fetchStreetView.isPending} onClick={() => rotate(45)}>
                  Rotate right <RotateCw className="size-3.5" />
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Not facing the right side of the building? Try rotating.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" disabled={!preview} onClick={handleUse}>
            Use this photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
