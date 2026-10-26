import Link from "next/link";
import { ContactLine, LegalPage, Operator } from "@/components/legal/legal-page";
import { legalDetails } from "@/lib/legal";

export const metadata = { title: "Terms of Service · Ispentit", description: "The rules for using Ispentit, what it is and is not, and what you can expect from us." };

export default function TermsPage() {
  const { jurisdiction } = legalDetails();
  return (
    <LegalPage title="Terms of Service">
      <section aria-labelledby="agree">
        <h2 id="agree">Agreeing to these terms</h2>
        <p>
          These terms are between you and <Operator /> (“we”, “us”) and apply to your use of Ispentit. By creating an account or using the service you agree to them and to
          our <Link href="/privacy" className="underline">Privacy Policy</Link>. If you do not agree, please do not use the service. You must be old enough to enter a binding
          agreement where you live.
        </p>
      </section>

      <section aria-labelledby="what">
        <h2 id="what">What Ispentit is, and is not</h2>
        <p>
          Ispentit is a tool for recording and organising your own income, expenses, budgets, savings goals, accounts and recurring items, and for seeing summaries of what
          you recorded.
        </p>
        <ul>
          <li><strong>It is not a bank, payment service or lender.</strong> It never moves, holds or verifies money.</li>
          <li>
            <strong>Balances and totals reflect only what you enter.</strong> A “recorded balance” is not your bank balance and may differ from it. Savings-goal contributions and
            planned recurring items are planning records, not proof that money moved or was paid.
          </li>
          <li><strong>It is not financial, investment, tax, accounting or legal advice,</strong> and it is not a credit scoring service. Budget warnings are informational. Make your own decisions or consult a qualified professional.</li>
          <li>Only the Nigerian naira (NGN) is supported at present.</li>
        </ul>
      </section>

      <section aria-labelledby="account">
        <h2 id="account">Your account</h2>
        <ul>
          <li>Give accurate details and keep your password private. You are responsible for activity under your account.</li>
          <li>Tell us promptly if you think someone else has accessed your account. You can end other sessions and change your password in Settings.</li>
          <li>One person per account. Do not share credentials.</li>
        </ul>
      </section>

      <section aria-labelledby="use">
        <h2 id="use">Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>access, or try to access, anyone else’s account or data, or probe, scan or test the service for weaknesses without our written permission;</li>
          <li>overload or disrupt the service, bypass rate limits or security controls, or use automated means to create accounts or scrape data;</li>
          <li>upload files or text containing malware or anything unlawful, or use the service for any unlawful purpose such as concealing or processing proceeds of crime;</li>
          <li>resell or provide the service to others without our agreement.</li>
        </ul>
        <p>We may suspend or limit an account that breaks these rules or puts the service or other users at risk.</p>
      </section>

      <section aria-labelledby="data">
        <h2 id="data">Your data</h2>
        <p>
          Your records belong to you. You give us permission to store and process them only to provide the service to you, as described in the Privacy Policy. You are responsible
          for the accuracy of what you enter, and for keeping your own copies: export your data from time to time.
        </p>
      </section>

      <section aria-labelledby="avail">
        <h2 id="avail">Availability and changes</h2>
        <p>
          We work to keep Ispentit running and your data safe, but the service is provided “as is” and “as available”. It may be interrupted, contain errors, or change. We may add,
          change or remove features, and we will try to give notice of changes that significantly affect you.
        </p>
      </section>

      <section aria-labelledby="liability">
        <h2 id="liability">Warranties and liability</h2>
        <p>
          To the fullest extent the law allows, we give no warranty that the service or its calculations will be error-free or fit for any particular purpose, and we are not liable for
          losses arising from decisions you make using the service, from inaccurate data you entered, or from interruptions or data loss. Nothing in these terms limits liability that
          cannot be limited by law, and your legal rights as a consumer are not affected.
        </p>
      </section>

      <section aria-labelledby="end">
        <h2 id="end">Ending your use</h2>
        <p>
          You can stop at any time and delete your account in Settings, which permanently removes your data as described in the Privacy Policy. We may suspend or close accounts that
          break these terms, or close the service with reasonable notice; where we can, we will give you the chance to export your data first.
        </p>
      </section>

      <section aria-labelledby="changes">
        <h2 id="changes">Changes to these terms</h2>
        <p>
          We may update these terms. We will change the effective date above and, for significant changes, tell signed-in users before they take effect. Continuing to use the service after
          a change means you accept it.
        </p>
      </section>

      <section aria-labelledby="law">
        <h2 id="law">Governing law and contact</h2>
        <p>
          {jurisdiction ? <>These terms are governed by the laws of {jurisdiction}, and the courts there have jurisdiction, without affecting any rights you have under mandatory consumer law where you live.</> : <>The governing law for these terms has not been configured for this deployment.</>}
        </p>
        <p>Questions about these terms: <ContactLine />.</p>
      </section>
    </LegalPage>
  );
}
