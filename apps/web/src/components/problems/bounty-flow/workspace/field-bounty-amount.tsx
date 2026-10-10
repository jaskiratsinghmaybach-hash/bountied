import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FieldBountyAmountProps = {
  value: string;
  onChange: (val: string) => void;
};
export function FieldBountyAmount({ value, onChange }: FieldBountyAmountProps) {
  const platformFee = Number(value) > 0 ? Number(value) * 0.1 : 0;
  const totalCharge = Number(value) > 0 ? Number(value) + platformFee : 0;
  return (
    <Card className="border-border bg-surface">
      <CardHeader className="p-5 pb-3">
        <label htmlFor="bountyAmount" className="block text-xs font-medium uppercase tracking-wide text-foreground-muted">
          Bounty amount (USD)
        </label>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <div className="relative w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted z-10">$</span>
          <Input
            id="bountyAmount"
            name="bountyAmount"
            type="number"
            min={1}
            step="0.01"
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="100.00"
            className="w-full pl-7 pr-3 py-2.5 font-mono bg-background border-border focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none text-2xl font-bold h-auto"
          />
        </div>
        {Number(value) > 0 && (
          <div className="mt-4 flex flex-col gap-1.5 text-xs font-mono">
            <div className="flex justify-between text-foreground-muted">
              <span>Bounty (goes to solver)</span>
              <span>${Number(value).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-foreground-muted">
              <span>Platform fee (10%)</span>
              <span>${platformFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border mt-1">
              <span className="text-sm font-bold text-foreground">Total charged to your credits</span>
              <span className="text-sm font-bold italic text-foreground">${totalCharge.toFixed(2)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
