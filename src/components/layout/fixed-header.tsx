export function FixedHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="relative mx-auto max-w-6xl px-6 h-full flex items-center justify-between">
        {children}
      </div>
    </header>
  );
}
