type FieldBountyAmountProps = {
  value: string;
  onChange: (val: string) => void;
};
export function FieldBountyAmount({ value, onChange }: FieldBountyAmountProps) {
  const platformFee = Number(value) > 0 ? Number(value) * 0.1 : 0;
  const totalCharge = Number(value) > 0 ? Number(value) + platformFee : 0;
  return (
    <div className="rounded-lg border border-money/30 bg-money/5 p-5">
      <label htmlFor="bountyAmount" className="block text-xs font-medium uppercase tracking-wide text-foreground-muted mb-3">
        Bounty amount (USD)
      </label>
      <div className="relative w-full">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">$</span>
        <input
          id="bountyAmount"
          name="bountyAmount"
          type="number"
          min={1}
          step="0.01"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="100.00"
          className="w-full rounded-md border border-border bg-surface pl-6 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all font-mono"
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
          <div className="flex justify-between text-foreground font-semibold pt-1.5 border-t border-border">
            <span>Total charged to your credits</span>
            <span className="text-money">${totalCharge.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
