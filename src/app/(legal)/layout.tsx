import { LegalFooter } from "@/components/legal/legal-footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main id="main" className="flex-1">{children}</main>
      <LegalFooter />
    </>
  );
}
