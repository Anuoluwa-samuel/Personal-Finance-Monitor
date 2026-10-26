export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading your dashboard</span>
      <div className="h-8 w-48 rounded bg-border" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg bg-border" />
        ))}
      </div>
      <div className="h-72 rounded-lg bg-border" />
    </div>
  );
}
