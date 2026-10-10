import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { X, Info } from "lucide-react";

import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  onDismiss: () => void;
  duration?: number; // ms, default 8000
  variant?: "default" | "destructive";
}

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed right-4 top-[calc(4rem+0.75rem)] z-[100] flex max-h-screen w-full max-w-[420px] flex-col gap-2 p-0 outline-none",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const ToastRoot = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Root
    ref={ref}
    className={cn(
      "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2",
      className,
    )}
    {...props}
  />
));
ToastRoot.displayName = ToastPrimitives.Root.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "ml-2 rounded-md p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      className,
    )}
    {...props}
  />
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

export function Toast({ message, onDismiss, duration = 8000, variant = "destructive" }: ToastProps) {
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      setOpen(false);
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss, open]);

  const isDestructive = variant === "destructive";

  return (
    <ToastPrimitives.Provider swipeDirection="right">
      <ToastRoot
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) onDismiss();
        }}
        role="alert"
        className={
          isDestructive
            ? "border-destructive/30 bg-destructive/10"
            : "border-border bg-surface-raised"
        }
      >
        {isDestructive ? (
          <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground-muted" />
        )}
        <div
          className={cn(
            "flex-1 text-xs font-normal",
            isDestructive ? "text-destructive" : "text-foreground"
          )}
        >
          {message}
        </div>
        <ToastClose
          aria-label="Dismiss toast"
          asChild
          className={
            isDestructive
              ? "text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
              : "text-foreground-muted hover:bg-surface hover:text-foreground"
          }
        >
          <button type="button" aria-label="Dismiss toast">
            <X className="h-3.5 w-3.5" />
          </button>
        </ToastClose>
      </ToastRoot>
      <ToastViewport />
    </ToastPrimitives.Provider>
  );
}
