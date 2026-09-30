import { HelpCircle, X } from "lucide-react";
import { usePageGuide } from "@/hooks/usePageGuide";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  /** Unique per page, used as the localStorage key — e.g. "quotes", "materials". */
  pageKey: string;
  /** What this section is actually for. */
  what: string;
  /** Why it's worth using / how it helps the business. */
  why: string;
  /** A short, concrete "here's what to do" pointer. */
  how: string;
}

// A short, dismissible explainer shown at the top of a page — what it's
// for, why it's useful, and what to actually do here. Collapses to a
// small "?" button once dismissed (remembered per browser, not per
// account) so it never becomes permanent clutter for someone who already
// knows the app, but stays one click away if they want it back.
export function PageGuide({ pageKey, what, why, how }: Props) {
  const { dismissed, setDismissed } = usePageGuide(pageKey);

  if (dismissed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        title="Show what this page is for"
        onClick={() => setDismissed(false)}
        className="text-muted-foreground"
      >
        <HelpCircle className="size-4" />
      </Button>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-1.5 py-4 text-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 font-medium">
            <HelpCircle className="size-4 text-primary" /> What this page is for
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1.5 -mt-1.5 size-6"
            title="Hide this"
            onClick={() => setDismissed(true)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
        <p className="text-muted-foreground">{what}</p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Why it helps: </span>
          {why}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">What to do: </span>
          {how}
        </p>
      </CardContent>
    </Card>
  );
}
