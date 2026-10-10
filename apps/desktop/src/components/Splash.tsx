import { Loader2 } from "lucide-react";
import { BrandMark } from "./Pairing";

export function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4" aria-busy="true">
      <BrandMark size={44} />
      <Loader2 size={16} className="animate-spin text-muted" aria-label="Loading" />
    </div>
  );
}
