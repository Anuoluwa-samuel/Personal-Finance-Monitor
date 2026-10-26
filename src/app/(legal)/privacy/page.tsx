import { ContactLine, LegalPage, Operator } from "@/components/legal/legal-page";

export const metadata = { title: "Privacy Policy · Ispentit", description: "What Ispentit collects, why, who sees it, how long it is kept, and your choices." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <section aria-labelledby="who">
        <h2 id="who">Who we are</h2>
        <p>
          Ispentit is a personal finance tracking service run by <Operator /> (“we”, “us”). This policy explains what personal information the service
          handles, why, who can see it, how long it is kept, and what you can do about it. Questions: <ContactLine />.
        </p>
        <p>
          In short: your financial records are yours. We use them only to run the service for you. We do not sell them, show advertising, or send them
          to analytics providers.
        </p>
      </section>

      <section aria-labelledby="collect">
        <h2 id="collect">What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> your name and email address, and a one-way hash of your password. We never store your password in readable form.</li>
          <li>
            <strong>Records you enter:</strong> transactions (amount, date, description, category, optional notes and account), categories, budgets, savings goals and
            contributions, accounts and opening balances, and recurring rules. Amounts and descriptions are exactly what you type; we do not read them from your bank.
          </li>
          <li><strong>Preferences:</strong> your timezone, theme and currency.</li>
          <li>
            <strong>Sign-in and security data:</strong> for each active session, a session token, when it was created and last used, your IP address and your browser’s
            user-agent string. You can see and end these sessions in Settings. Short-lived counters (kept against your IP address and the action) limit repeated sign-in,
            sign-up and reset attempts.
          </li>
          <li><strong>One-time tokens:</strong> email-verification and password-reset tokens, valid for one hour.</li>
          <li>
            <strong>Imports:</strong> if you import a CSV file, the file itself is not kept, but the rows that passed checking are staged in our database until you confirm or cancel
            the import or the preview expires (one hour). Expired previews are removed the next time you start an import and when you delete your account.
          </li>
        </ul>
        <p>We do not ask for bank logins, card numbers, government ID numbers or similar, and the service does not connect to your bank.</p>
      </section>

      <section aria-labelledby="use">
        <h2 id="use">How we use it</h2>
        <ul>
          <li>To provide the features you use: recording, categorising and summarising your money, budgets, goals, exports and imports.</li>
          <li>To sign you in, keep your account secure, detect abuse and limit repeated attempts.</li>
          <li>To send the emails the service needs: verifying your address and resetting your password. We do not send marketing email.</li>
          <li>To fix problems. Error logs are written without amounts or descriptions.</li>
        </ul>
        <p>We do not use your data for advertising, profiling, or selling to anyone, and we do not make automated decisions about you.</p>
      </section>

      <section aria-labelledby="share">
        <h2 id="share">Who else handles it</h2>
        <p>Only the providers needed to run the service, acting for us:</p>
        <ul>
          <li><strong>Hosting and database providers</strong> that run the application and store the data.</li>
          <li><strong>An email delivery provider</strong>, which receives your email address and the text of verification and reset messages so it can deliver them.</li>
        </ul>
        <p>
          There are no analytics, advertising or tracking services and no third-party financial integrations. We may disclose information if the law requires it.
          Where these providers are located determines where your data is stored; this may be outside your country.
        </p>
      </section>

      <section aria-labelledby="cookies">
        <h2 id="cookies">Cookies</h2>
        <ul>
          <li><strong>Session cookie</strong> (essential): keeps you signed in. It is marked HttpOnly, so scripts on the page cannot read it, and Secure when served over HTTPS.</li>
          <li><strong>Theme cookie</strong> (preference): remembers whether you chose a light or dark theme.</li>
        </ul>
        <p>We do not use advertising or analytics cookies.</p>
      </section>

      <section aria-labelledby="keep">
        <h2 id="keep">How long we keep it</h2>
        <ul>
          <li>Your records and account details are kept while your account exists.</li>
          <li>
            When you delete your account in Settings, your account and everything recorded under it is removed from the live database straight away. Copies may remain in
            database backups until those backups expire; how long backups are kept depends on the hosting provider and is not controlled by the application.
          </li>
          <li>A sign-in session expires after about 7 days without use, or sooner if you sign out. Verification and reset tokens expire after one hour.</li>
          <li>Our hosting provider may keep ordinary request logs (for example IP address and page requested) for its own operational and security purposes.</li>
        </ul>
      </section>

      <section aria-labelledby="security">
        <h2 id="security">How we protect it</h2>
        <p>
          Passwords are hashed; every request is checked so you can only reach your own records; the service uses secure session cookies, rate limits on sensitive actions,
          security headers and a content security policy, and traffic should be encrypted with HTTPS. No online service can promise perfect security, and we do not claim
          any external security certification. Please use a strong, unique password and keep your devices secure.
        </p>
      </section>

      <section aria-labelledby="rights">
        <h2 id="rights">Your choices and rights</h2>
        <ul>
          <li><strong>See and export:</strong> everything you entered is visible in the app, and you can export your transactions as CSV at any time.</li>
          <li><strong>Correct:</strong> edit or delete any record, category, budget, goal, account or rule yourself.</li>
          <li><strong>Delete:</strong> delete your whole account from Settings. Export first if you want a copy; deletion cannot be undone.</li>
          <li><strong>Control sessions:</strong> sign out of other devices from Settings, or change your password, which signs other devices out.</li>
        </ul>
        <p>
          Depending on where you live you may have additional rights, such as asking what we hold about you, objecting to processing, or complaining to a data-protection
          authority. To exercise a right that the app does not cover, contact <ContactLine />.
        </p>
      </section>

      <section aria-labelledby="kids">
        <h2 id="kids">Children</h2>
        <p>Ispentit is not intended for children. If you believe a child has created an account, contact us and we will delete it.</p>
      </section>

      <section aria-labelledby="changes">
        <h2 id="changes">Changes to this policy</h2>
        <p>
          If we change this policy in a way that matters, we will update the effective date above and, for significant changes, tell signed-in users in the app or by email
          before the change takes effect.
        </p>
      </section>
    </LegalPage>
  );
}
