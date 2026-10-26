import Link from "next/link";
import { ForgotForm } from "@/components/auth/forgot-form";
export const metadata = { title: "Reset your password · Ispentit" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <ForgotForm />
      <p className="text-sm text-muted"><Link href="/login" className="underline">Back to sign in</Link></p>
    </>
  );
}
