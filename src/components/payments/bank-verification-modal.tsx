"use client";

import { useState, type FormEvent } from "react";
import { COUNTRY_BANK_FIELDS, SUPPORTED_COUNTRIES } from "@/lib/payments/bank-fields";

export function BankVerificationModal({
  onClose,
  onVerified,
}: {
  onClose: () => void;
  onVerified: () => void;
}) {
  const [legalName, setLegalName] = useState("");
  const [country, setCountry] = useState("US");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const bankFields = COUNTRY_BANK_FIELDS[country] ?? COUNTRY_BANK_FIELDS.DEFAULT;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});

    const res = await fetch("/api/payouts/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legalName, country, fields }),
    });

    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setFieldErrors(data.fieldErrors ?? { _general: data.error ?? "Something went wrong" });
      return;
    }

    onVerified();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight mb-1">Verify bank account</h2>
        <p className="text-sm text-foreground-muted mb-6">
          Required before you can withdraw earnings.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-foreground-muted mb-1.5">
              Full Legal Name (Must match your bank account)
            </label>
            <input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
            />
            <p className="text-xs text-foreground-muted mt-1.5 leading-relaxed">
              Do not enter gamer tags or pseudonyms. Bank transfers will bounce if this
              name does not match your official banking account records.
            </p>
          </div>

          <div>
            <label className="block text-xs text-foreground-muted mb-1.5">Country</label>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setFields({});
              }}
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
            >
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {bankFields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-foreground-muted mb-1.5">{f.label}</label>
              <input
                value={fields[f.key] ?? ""}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                required
                className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
              />
              {fieldErrors[f.key] && (
                <p className="text-xs text-danger mt-1">{fieldErrors[f.key]}</p>
              )}
            </div>
          ))}

          {fieldErrors._general && (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {fieldErrors._general}
            </p>
          )}

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border text-foreground text-sm font-medium px-4 py-2.5 hover:bg-surface-raised transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
            >
              {pending ? "Verifying…" : "Verify"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
