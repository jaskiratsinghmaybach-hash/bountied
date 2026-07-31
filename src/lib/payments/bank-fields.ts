export type BankFieldConfig = { key: string; label: string; placeholder?: string }[];

export const COUNTRY_BANK_FIELDS: Record<string, BankFieldConfig> = {
  US: [
    { key: "accountNumber", label: "Account Number" },
    { key: "routingNumber", label: "ACH Routing Number" },
  ],
  IN: [
    { key: "accountNumber", label: "Account Number" },
    { key: "ifscCode", label: "IFSC Code" },
  ],
  GB: [
    { key: "iban", label: "IBAN" },
    { key: "bic", label: "BIC / SWIFT Code" },
  ],
  DE: [
    { key: "iban", label: "IBAN" },
    { key: "bic", label: "BIC / SWIFT Code" },
  ],
  DEFAULT: [
    { key: "accountNumber", label: "Account Number" },
    { key: "swiftCode", label: "SWIFT Code" },
  ],
};

export const SUPPORTED_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "IN", name: "India" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
];
