import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useAddChecklistItem, useDeleteChecklistItem, useJobChecklist, useToggleChecklistItem } from "@/hooks/useJobChecklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface JobChecklistCardProps {
  jobId: string;
  ownerId: string;
}

export function JobChecklistCard({ jobId, ownerId }: JobChecklistCardProps) {
  const { data: items } = useJobChecklist(jobId);
  const addItem = useAddChecklistItem();
  const toggleItem = useToggleChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const [text, setText] = useState("");

  const doneCount = (items ?? []).filter((i) => i.done).length;
  const total = (items ?? []).length;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await addItem.mutateAsync({ ownerId, jobId, text: text.trim(), position: total });
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add checklist item");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Checklist</CardTitle>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {doneCount}/{total} done
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pb-6">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a checklist item…"
          />
          <Button type="submit" size="icon" disabled={addItem.isPending || !text.trim()}>
            <Plus />
          </Button>
        </form>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No checklist items yet — a punch list, safety steps, or anything else you want to make sure
            doesn't get missed on this job.
          </p>
        ) : (
          <div className="space-y-1">
            {(items ?? []).map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                <Checkbox
                  checked={item.done}
                  onCheckedChange={(c) => toggleItem.mutate({ id: item.id, jobId, done: !!c })}
                />
                <span className={cn("flex-1 text-sm", item.done && "text-muted-foreground line-through")}>
                  {item.text}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => deleteItem.mutate({ id: item.id, jobId })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
