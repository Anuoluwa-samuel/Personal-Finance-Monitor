import Link from "next/link";
import { ResetForm } from "@/components/auth/reset-form";
import { FormMessage } from "@/components/ui/field";

export const metadata = { title: "Choose a new password · Ispentit" };

export default async function Page({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : undefined;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      {value ? (
        <ResetForm token={value} />
      ) : (
        <FormMessage kind="error">
          This reset link is invalid or has expired.{" "}
          <Link href="/forgot-password" className="underline">
            Request a new one
          </Link>
        </FormMessage>
      )}
    </>
  );
}
