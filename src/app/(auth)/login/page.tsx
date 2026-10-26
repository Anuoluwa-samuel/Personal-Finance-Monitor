import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
export const metadata = { title: "Sign in · Ispentit" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <LoginForm />
      <p className="text-sm text-muted">New here? <Link href="/register" className="underline">Create an account</Link></p>
    </>
  );
}
