import { useEffect, useRef, useState } from "react";
import { Pencil, Type, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COLORS = ["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#ffffff", "#000000"];
const LINE_WIDTH = 5;
const FONT_SIZE = 32;

type Point = { x: number; y: number };
type Action =
  | { type: "stroke"; points: Point[]; color: string }
  | { type: "text"; x: number; y: number; text: string; color: string };

interface PhotoAnnotatorProps {
  imageUrl: string;
  onCancel: () => void;
  onSave: (blob: Blob) => void | Promise<void>;
  saving?: boolean;
}

// A lightweight, self-contained markup tool — draw arrows/circles/notes
// on a job photo (CompanyCam-style annotation) without pulling in a full
// canvas-editing library. Freehand pen + click-to-place text, redrawn from
// an action list each time so undo/clear are trivial.
export function PhotoAnnotator({ imageUrl, onCancel, onSave, saving }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<"pen" | "text">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [actions, setActions] = useState<Action[]>([]);
  const drawingRef = useRef<Point[] | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      setReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  function redraw(currentStrokePoints?: Point[]) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const action of actions) {
      if (action.type === "stroke") drawStroke(ctx, action.points, action.color);
      else drawText(ctx, action.x, action.y, action.text, action.color);
    }
    if (currentStrokePoints) drawStroke(ctx, currentStrokePoints, color);
  }

  function drawStroke(ctx: CanvasRenderingContext2D, points: Point[], strokeColor: string) {
    if (points.length < 2) return;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function drawText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, textColor: string) {
    ctx.font = `bold ${FONT_SIZE}px system-ui, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.strokeStyle = textColor === "#000000" ? "#ffffff" : "#000000";
    ctx.lineWidth = 3;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  useEffect(() => {
    if (ready) redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, actions]);

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(e);
    if (tool === "text") {
      const text = window.prompt("Enter a note to place on the photo:");
      if (text && text.trim()) {
        setActions((prev) => [...prev, { type: "text", x: point.x, y: point.y, text: text.trim(), color }]);
      }
      return;
    }
    drawingRef.current = [point];
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current.push(canvasPoint(e));
    redraw(drawingRef.current);
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    const points = drawingRef.current;
    drawingRef.current = null;
    if (points.length > 1) {
      setActions((prev) => [...prev, { type: "stroke", points, color }]);
    }
  }

  function handleUndo() {
    setActions((prev) => prev.slice(0, -1));
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob) await onSave(blob);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mark up photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border p-1">
            <Button
              type="button"
              variant={tool === "pen" ? "secondary" : "ghost"}
              size="icon"
              title="Draw"
              onClick={() => setTool("pen")}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant={tool === "text" ? "secondary" : "ghost"}
              size="icon"
              title="Add text"
              onClick={() => setTool("text")}
            >
              <Type className="size-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={c}
                className={cn(
                  "size-6 rounded-full border-2",
                  color === c ? "border-primary" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleUndo} disabled={actions.length === 0}>
            <Undo2 className="size-4" /> Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActions([])}
            disabled={actions.length === 0}
          >
            <X className="size-4" /> Clear
          </Button>
        </div>

        <div className="flex justify-center overflow-hidden rounded-md border bg-secondary/30">
          <canvas
            ref={canvasRef}
            className="max-h-[60vh] max-w-full touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {tool === "pen" ? "Draw with your finger or mouse." : "Tap where you want a note placed."}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!ready || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
