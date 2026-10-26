import Link from "next/link";
import { buttonClass } from "@/components/ui/field";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-3 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-muted">That item does not exist, or it is not yours to see.</p>
      <Link href="/dashboard" className={buttonClass}>Back to the dashboard</Link>
    </div>
  );
}
