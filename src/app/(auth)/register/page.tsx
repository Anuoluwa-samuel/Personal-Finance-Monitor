import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
export const metadata = { title: "Create account · Ispentit" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <RegisterForm />
      <p className="text-sm text-muted">Already registered? <Link href="/login" className="underline">Sign in</Link></p>
    </>
  );
}
