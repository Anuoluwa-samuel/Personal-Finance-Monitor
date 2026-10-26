export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading</span>
      <div className="h-8 w-48 rounded bg-border" />
      <div className="h-24 rounded-lg bg-border" />
      <div className="h-48 rounded-lg bg-border" />
    </div>
  );
}
