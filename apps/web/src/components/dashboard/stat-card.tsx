import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Use sparingly — true renders the value in the money/accent color, for the one number that matters most on a given dashboard */
  accent?: boolean;
}) {
  return (
    <Card className="bg-surface shadow-none border-border">
      <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0 p-5 pb-0">
        <CardTitle className="text-xs text-foreground-muted uppercase tracking-wide font-normal min-h-[2rem] flex-1 pr-4">
          {label}
        </CardTitle>
        <Icon size={16} className="text-foreground-muted mt-0.5" />
      </CardHeader>
      <CardContent className="p-5 pt-3">
        <p className="font-mono text-2xl font-semibold text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
