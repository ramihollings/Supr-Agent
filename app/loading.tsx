export default function Loading() {
  return (
    <div className="flex-1 min-h-screen bg-surface-container flex flex-col items-center justify-center p-8 gap-4">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-primary animate-pulse" />
        <span className="w-3 h-3 rounded-full bg-primary animate-pulse" style={{ animationDelay: "120ms" }} />
        <span className="w-3 h-3 rounded-full bg-primary animate-pulse" style={{ animationDelay: "240ms" }} />
      </div>
      <p className="font-body text-sm text-on-surface-variant">Loading…</p>
    </div>
  );
}
