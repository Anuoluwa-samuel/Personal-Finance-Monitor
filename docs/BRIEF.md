# PROJECT: ISPENTIT
A Secure, Full-Stack Personal Finance Management Platform

Act as a senior full-stack engineer, software architect, database engineer, security specialist, QA engineer, and product designer.

Build a complete, secure, responsive, production-minded personal finance tracker named Ispentit.

The application must help individuals understand, organize, and improve their financial habits by recording income and expenses, managing budgets, tracking transactions, setting savings goals, and reviewing financial analytics.

Do not build a static dashboard with fake numbers. Build a functional application with real authentication, persistent database records, reliable financial calculations, server-side validation, secure authorization, automated tests, and deployment documentation.

The final application must be suitable for a professional software engineering portfolio.

Prioritize financial accuracy, security, usability, maintainability, and clear architecture.

## 1. PRODUCT VISION

Ispentit is a personal finance management application that gives users a clear picture of where their money comes from, where it goes, and how their financial habits change over time.

### Target users
- Students managing limited income.
- Young professionals tracking salary and spending.
- Freelancers with irregular income.
- Individuals saving toward personal goals.
- People who want a clear record of their financial activities.

### Core principles
1. Financial calculations must be accurate and consistent.
2. Users must own and control their financial data.
3. No user may access another user's financial records.
4. Financial transactions must persist across sessions and devices.
5. Every important financial mutation must be validated on the server.
6. The interface must make important information understandable at a glance.
7. The product must work well on mobile and desktop.
8. Users must be able to correct mistakes without corrupting their financial history.
9. Charts and reports must reflect actual database records.
10. The application must be transparent about what it can and cannot verify.

The application is a personal financial organization tool, not a bank, payment processor, investment adviser, or credit scoring service.

## 2. TECHNOLOGY STACK

Use stable, compatible versions of the following technologies. Verify current documentation before selecting dependencies and maintain a lockfile.

### Frontend
- Next.js App Router.
- React.
- TypeScript with strict mode.
- Tailwind CSS.
- shadcn/ui for suitable accessible components.
- Lucide icons.
- Recharts for financial visualizations.
- Zod for input validation.
- React Hook Form where it improves complex forms.

### Backend
Use Next.js Route Handlers and Server Components as appropriate. Server Actions may be used for suitable form-based mutations.

Separate business rules from presentation and request-handling code.

Create reusable server-side services for transactions, budgets, categories, savings goals, and analytics.

### Database
- PostgreSQL.
- Drizzle ORM.
- Drizzle Kit migrations.
- Managed PostgreSQL for production.

### Authentication
Use a maintained authentication library compatible with the selected framework and database.

Support registration, login, email verification, password reset, logout, session management, protected routes, and account deletion.

Never implement custom cryptographic authentication protocols.

### Testing
- Vitest.
- React Testing Library.
- Playwright.

Use the most appropriate tools for unit, integration, and end-to-end tests.

### Deployment
Prepare for deployment to Vercel or a compatible Node.js host with managed PostgreSQL and a configured email delivery provider.

Do not assume local files, in-memory state, or browser storage are reliable sources of production financial data.

## 3. USER AUTHENTICATION AND ACCOUNT SECURITY

Implement complete user authentication.

Required functionality:
- Account registration.
- Login and logout.
- Email verification.
- Password reset.
- Session expiration and revocation.
- Protected dashboard routes.
- Account profile and settings.
- Account deletion with confirmation.
- Clear authentication error states.

### Security requirements
- Use the selected authentication library's supported password-hashing implementation.
- Never store plaintext passwords.
- Use appropriately configured Secure, HttpOnly, SameSite cookies in production.
- Validate all sensitive operations on the server.
- Rate-limit login, registration, verification, and password reset.
- Avoid revealing whether an email address exists in sensitive authentication responses.
- Use short-lived, single-use verification and password-reset tokens, stored securely.
- Revoke relevant sessions after security-sensitive changes.
- Keep credentials and secrets out of the repository.
- Protect state-changing cookie-authenticated requests against CSRF according to the chosen framework and library.
- Apply appropriate security headers and a considered Content Security Policy.
- Do not expose internal stack traces or database errors to users.

Never rely on frontend route protection alone.

Every financial data operation must independently authenticate the user and verify resource ownership.

## 4. CORE DASHBOARD

Create a premium financial dashboard that answers these questions immediately:
- How much money have I recorded?
- How much income have I received?
- How much have I spent?
- How much have I saved?
- Where is my money going?
- How does this month compare with previous months?
- Am I staying within my budgets?

### Dashboard components

**Financial overview** — Display:
- Current recorded balance.
- Income for the selected period.
- Expenses for the selected period.
- Net cash flow.
- Budget utilization.
- Savings goal progress.

Clearly label the time period and the definition of each metric.

Do not confuse recorded cash flow with a verified bank balance.

**Recent transactions** — Display the latest transactions with:
- Description.
- Category.
- Date.
- Transaction type.
- Amount.
- Optional account.
- Status where relevant.

Allow users to open, edit, or delete transactions they own.

**Financial charts** — Provide:
- Income versus expenses over time.
- Spending by category.
- Monthly cash-flow trends.
- Budget utilization.
- Savings-goal progress.

Charts must use actual persisted records and meaningful date ranges.

Provide empty states instead of fabricated data.

Include accessible chart labels or accompanying summaries.

**Dashboard filters** — Allow users to filter by:
- Current month.
- Previous month.
- Last 30 days.
- Last 90 days.
- Current year.
- Custom date range.

Validate date ranges on the server and define timezone handling consistently.

## 5. TRANSACTION MANAGEMENT

This is the central feature of the application.

Users must be able to create, view, edit, filter, and delete financial transactions.

### Transaction fields
Include:
- Unique transaction ID.
- User ID.
- Transaction type.
- Amount.
- Description.
- Category.
- Transaction date.
- Optional account.
- Optional notes.
- Creation timestamp.
- Update timestamp.

Support income and expense transactions in the initial release.

Transfers between accounts may be introduced as a later feature, but design the domain model so they can be added without corrupting income and expense calculations.

### Transaction functionality
- Add income.
- Add an expense.
- Edit an existing transaction.
- Delete a transaction with confirmation.
- Search by description.
- Filter by type.
- Filter by category.
- Filter by date.
- Sort by date and amount.
- Paginate large histories.
- View transaction details.
- Provide useful validation feedback.

### Financial integrity rules
1. Validate amounts on the server.
2. Reject zero, negative, non-finite, or out-of-range amounts according to the product's rules.
3. Represent monetary values using PostgreSQL `NUMERIC` or an equivalent exact decimal strategy.
4. Never rely on JavaScript floating-point arithmetic for authoritative financial calculations.
5. Use integer minor units or a decimal arithmetic library where appropriate.
6. Define currency precision explicitly.
7. Do not silently round user-entered values.
8. Recalculate derived statistics from authoritative records or maintain them through a clearly defined consistency strategy.
9. Prevent duplicate submissions from creating duplicate transactions when idempotency is needed.
10. Use database transactions for related multi-step changes.
11. Ensure users cannot assign transactions to accounts or categories they do not own.
12. Handle transaction edits and deletions consistently across analytics and budgets.

Use explicit rules for the meaning of balance, income, expense, net cash flow, and savings.

Do not treat every positive net cash-flow result as money actually saved.

## 6. MONEY, CURRENCY, AND DATE HANDLING

Financial correctness is mandatory.

### Currency
- Support a user-selected primary currency.
- Include NGN as a suitable default option for a Nigerian user.
- Design the currency model so additional currencies can be supported.
- Store the currency code with relevant financial records.
- Format currency consistently using suitable internationalization APIs.
- Define the precision of each supported currency.
- Never add amounts in different currencies without a documented conversion policy.
- Do not imply live foreign exchange conversion unless a real, configured rate source is integrated.

For the initial release, keep calculations within a single selected currency per user. If multi-currency transactions are supported later, implement an explicit exchange-rate and historical valuation model.

### Dates and timezones
- Store transaction timestamps consistently, normally in UTC when they represent instants.
- Treat user-entered transaction dates as calendar dates when appropriate.
- Store the user's timezone preference.
- Define the start and end of reporting periods using that timezone.
- Avoid off-by-one errors near midnight.
- Handle month boundaries, year boundaries, and leap years.
- Test date filters and monthly summaries thoroughly.

### Derived financial metrics
Document and test the calculation rules for:
- Total recorded income.
- Total recorded expenses.
- Net cash flow.
- Recorded balance.
- Category totals.
- Budget utilization.
- Savings-goal progress.

For example: Net cash flow = recorded income − recorded expenses.

Recorded balance should be clearly defined, including whether opening balances and account transfers are supported.

Never count a transfer between a user's own accounts as income or expense if transfers are introduced.

## 7. CATEGORY MANAGEMENT

Provide default categories and allow users to create their own.

**Example expense categories:** Food and groceries; Transport; Housing; Utilities; Education; Health; Entertainment; Shopping; Subscriptions; Personal care; Miscellaneous.

**Example income categories:** Salary; Freelance income; Business income; Allowance; Gifts; Other income.

### Requirements
- Each category must have a type or a clearly defined applicability rule.
- Support category names, optional icons, and optional colours.
- Prevent duplicate or conflicting category names according to a documented policy.
- Allow users to edit and archive their custom categories.
- Protect system-provided categories from unauthorized modification.
- Define what happens to historical transactions when a category is archived or deleted.
- Do not silently erase historical financial meaning.

Validate category ownership and compatibility with the transaction type on the server.

## 8. BUDGET MANAGEMENT

Allow users to establish spending limits.

### Budget functionality
Users can:
- Create a monthly budget.
- Set an overall spending limit.
- Set category-specific limits.
- Edit or archive a budget.
- View total spending against the budget.
- See remaining budget.
- See percentage utilization.
- Review budget history.
- Receive visual warnings as spending approaches or exceeds a limit.

### Budget rules
Define whether budgets are monthly, weekly, or custom-period budgets. Begin with monthly budgets.

Prevent conflicting duplicate budgets for the same user, category, and period unless the product explicitly supports multiple budget plans.

Calculate actual spending from eligible expense transactions only.

Define how refunds, deleted transactions, and edited transactions affect spending.

Do not count income as spending.

Use database constraints where practical and server-side validation for all budget mutations.

Budget warnings should be informative rather than shaming or manipulative.

## 9. SAVINGS GOALS

Let users create personal savings targets.

Each goal may include:
- Goal name.
- Target amount.
- Starting amount, if applicable.
- Optional target date.
- Currency.
- Current progress.
- Creation date.
- Status.

Examples include saving for a laptop, rent, education, travel, or an emergency fund.

Users should be able to:
- Create a goal.
- Edit a goal.
- Record contributions.
- Review contribution history.
- View progress toward the target.
- Mark a goal complete.
- Archive or delete a goal.

Do not confuse a savings-goal contribution with a bank transfer or expense unless the accounting model explicitly defines that behaviour.

For the initial version, goal contributions may be tracked as separate planning records. Explain that these records do not verify that money has physically moved into a bank account.

Prevent progress from exceeding defined limits unless overfunding is explicitly allowed.

## 10. RECURRING TRANSACTIONS

Design recurring transaction support as an optional feature that can be implemented after the core transaction engine is stable.

Possible recurring schedules: Weekly; Monthly; Yearly; Custom supported intervals.

Examples include rent, subscriptions, salary, and regular bills.

If implemented:
- Store the recurrence rule and next scheduled date.
- Validate schedules.
- Prevent duplicate generated transactions.
- Track generated occurrences.
- Handle skipped or cancelled occurrences.
- Ensure the same scheduled occurrence cannot be processed twice.
- Use an idempotent scheduled job or controlled generation process.
- Do not depend on an open browser tab to create recurring transactions.
- Clearly distinguish planned transactions from actual transactions.

Do not claim a recurring transaction has been paid merely because its scheduled date has passed.

## 11. DATABASE ARCHITECTURE

Use PostgreSQL with Drizzle ORM.

Design a normalized schema with appropriate foreign keys, indexes, constraints, and deletion policies.

### Suggested entities
- **Users and authentication** — Use the selected authentication library's required schema.
- **User preferences** — Primary currency; Timezone; Theme preference; Reporting preferences.
- **Accounts** — Optional for the first release, but useful if users need to track separate cash or bank balances. If accounts are included, define opening balances and the balance calculation strategy.
- **Transactions** — Store user-owned income and expense records.
- **Categories** — Support default categories and user-defined categories.
- **Budgets** — Store user-owned spending limits and their periods.
- **Savings goals** — Store savings targets and current planning status.
- **Savings contributions** — Track contributions associated with a savings goal.
- **Optional recurring transaction rules** — Store recurrence schedules and generation metadata if recurring transactions are implemented.

### Database requirements
- Use appropriate primary keys.
- Enforce ownership relationships.
- Add foreign keys and unique constraints.
- Add indexes for user/date queries, category filters, and common reporting operations.
- Use exact monetary types.
- Define cascade and restriction behaviour deliberately.
- Use transactions for related financial mutations.
- Prevent duplicate recurring occurrences where applicable.
- Avoid loading entire transaction histories into the client.
- Use migrations for all schema changes.
- Keep authentication data and financial data properly separated by domain.

Document important schema decisions and provide an entity-relationship diagram.

## 12. BACKEND ARCHITECTURE AND OPERATIONS

Organize the application into clear layers.

Suggested structure:

`src/app/` — Public pages; Authentication pages; Protected dashboard pages; Transactions; Budgets; Categories; Savings goals; Analytics; Settings; API Route Handlers.

`src/components/` — Shared UI; Dashboard widgets; Transaction forms and tables; Budget visualizations; Savings goal components; Charts; Navigation.

`src/lib/` — Database client; Authentication configuration; Environment validation; Formatting helpers; Shared utilities.

`src/server/` — Transaction services; Category services; Budget services; Savings-goal services; Analytics services; Authorization helpers.

`src/db/` — Schema; Migrations; Seed scripts.

`src/validators/` — Transaction schemas; Budget schemas; Category schemas; Savings-goal schemas.

`tests/` — Unit tests; Integration tests; End-to-end tests.

Adapt this structure when justified by framework conventions.

### Backend rules
1. Keep database access on the server.
2. Validate every mutation on the server.
3. Authenticate the user before accessing private records.
4. Enforce ownership on every read and write.
5. Keep financial calculations in reusable, testable domain functions.
6. Use exact monetary representations.
7. Use database transactions where consistency requires them.
8. Avoid trusting user-supplied calculated totals.
9. Return predictable errors and appropriate HTTP status codes.
10. Keep secrets out of client bundles.
11. Prevent private user data from entering shared caches.
12. Paginate large result sets.
13. Avoid unnecessary API calls and excessive database queries.

Use Route Handlers or Server Actions according to the use case. Do not introduce unnecessary microservices or distributed infrastructure.

## 13. SECURITY AND PRIVACY

Treat the application as sensitive-data software.

### Threat model
Identify:
- Financial records as sensitive assets.
- Authentication credentials and sessions as critical assets.
- Unauthorized access as a primary threat.
- Malicious input and manipulated requests.
- Insecure direct object references.
- Session theft and account takeover.
- Duplicate financial mutations.
- Data leakage through logs, caches, or error responses.
- Abuse through repeated requests.
- Accidental data loss.

### Required controls

**Authorization**
- Verify user identity for all private operations.
- Verify resource ownership at the database/service layer.
- Never trust a user ID supplied by the client.
- Prevent cross-user transaction, budget, account, category, and goal access.
- Use explicit writable-field allowlists.

**Input safety**
- Use server-side schema validation.
- Set maximum lengths and numeric limits.
- Reject malformed amounts, dates, and identifiers.
- Use parameterized database queries through the ORM.
- Avoid unsafe HTML rendering.
- Validate uploaded files if file uploads are introduced.

**Web security**
- Apply secure session-cookie settings.
- Protect state-changing requests against CSRF as appropriate.
- Use appropriate security headers.
- Configure a Content Security Policy.
- Avoid open redirects.
- Restrict CORS to explicitly required origins.
- Use TLS in production.
- Avoid exposing internal exceptions.

**Abuse prevention**
- Rate-limit sensitive endpoints.
- Bound request sizes.
- Paginate queries.
- Prevent duplicate financial mutations.
- Avoid unbounded analytics queries.
- Apply sensible account and resource limits.

**Secrets and operations**
- Store secrets in environment variables or a secret manager.
- Provide `.env.example` with placeholders only.
- Never commit production credentials.
- Separate development and production databases.
- Use least-privilege database credentials where supported.
- Audit dependencies.
- Document backup and recovery considerations.
- Avoid logging financial details unless strictly necessary.

**Privacy controls**
- Collect only information required by the product.
- Do not sell, expose, or publicly share user financial records.
- Do not send financial descriptions or amounts to analytics providers.
- Provide a clear account deletion process.
- Explain data retention and deletion behaviour.
- Ensure users can access and manage their own records.
- Avoid third-party financial integrations in the initial release unless explicitly configured and justified.

Do not claim regulatory compliance, banking-grade certification, or perfect security without the evidence required to support those claims.

## 14. IMPORT AND EXPORT

Implement CSV export for a user's own transactions.

Optional CSV import may be added after the core transaction flow is stable.

### Export requirements
- Export only the authenticated user's selected records.
- Validate date filters.
- Include clear column headers.
- Format dates and amounts consistently.
- Handle commas, quotation marks, and newlines correctly.
- Prevent spreadsheet formula injection in untrusted exported text.
- Do not expose internal credentials, session information, or other users' records.
- Apply sensible export size limits.

### Optional import requirements
If import is implemented:
- Validate file size and type.
- Parse rows safely.
- Preview imported data before committing.
- Validate amounts, categories, dates, and currency.
- Report row-level errors.
- Prevent duplicate imports through a defined deduplication strategy.
- Use transactions or controlled batches.
- Never execute formulas or macros from imported files.
- Require explicit user confirmation before writing imported records.

Do not allow a malformed CSV file to partially corrupt the user's records without a clear recovery strategy.

## 15. USER INTERFACE AND DESIGN SYSTEM

Build a distinctive, premium financial product.

### Design direction
Use a restrained, contemporary aesthetic:
- Clear typography.
- Neutral surfaces.
- Strong information hierarchy.
- Carefully selected accent colours.
- Clean data tables.
- Well-designed charts.
- Subtle borders.
- Consistent spacing.
- Thoughtful empty states.
- Responsive navigation.
- Clear form feedback.
- Restrained transitions.

Offer light and dark themes.

Avoid excessive gradients, decorative glass effects, oversized dashboard cards, and generic template aesthetics.

Financial information must be easy to scan without overwhelming the user.

### Required screens
1. Public landing page.
2. Registration and login.
3. Password reset.
4. Main dashboard.
5. Transaction history.
6. Add/edit transaction form.
7. Transaction details.
8. Category management.
9. Budget overview.
10. Budget creation and editing.
11. Savings goals.
12. Savings goal details and contributions.
13. Analytics and reports.
14. User settings.
15. Account deletion confirmation.
16. Loading, empty, error, and not-found states.

Ensure that every visible action has a working implementation or is explicitly marked as unavailable.

Do not use fake buttons or decorative controls that imply nonexistent functionality.

## 16. ACCESSIBILITY AND RESPONSIVENESS

Aim for WCAG 2.2 AA accessibility where practical.

Implement:
- Semantic HTML.
- Keyboard navigation.
- Visible focus states.
- Accessible form labels.
- Screen-reader-friendly validation messages.
- Sufficient colour contrast.
- Accessible dialogs.
- Appropriate touch target sizes.
- Reduced-motion support.
- Accessible charts or equivalent text summaries.
- Responsive tables and forms.
- Clear error and success feedback.

Never rely on colour alone to communicate budget status or transaction type.

Test at mobile, tablet, laptop, and desktop widths.

## 17. PERFORMANCE AND RELIABILITY

- Use server rendering where appropriate.
- Keep unnecessary client-side JavaScript to a minimum.
- Optimize database queries.
- Add pagination to transaction history.
- Avoid N+1 query patterns.
- Use aggregate SQL queries for financial summaries where appropriate.
- Avoid recalculating every metric independently for every dashboard component.
- Define a consistent cache strategy.
- Never share cached private financial data across users.
- Add loading states and appropriate error boundaries.
- Use transactions for related financial operations.
- Make retryable operations safe.
- Avoid introducing complex infrastructure prematurely.

Document performance decisions and verify that the application works with realistic transaction volumes.

## 18. TESTING STRATEGY

Testing must cover financial correctness, security, and realistic user journeys.

### Unit tests
Test:
- Monetary calculations.
- Currency formatting.
- Income and expense totals.
- Net cash flow.
- Recorded balance rules.
- Category totals.
- Budget utilization.
- Savings-goal progress.
- Refund and deletion rules, if supported.
- Date-range filtering.
- Monthly and yearly boundaries.
- Timezone handling.
- Input validation.
- CSV escaping and formula-injection protection.

Use deterministic test data and avoid floating-point-based assertions for exact monetary calculations.

### Integration tests
Test:
- Transaction creation.
- Transaction editing and deletion.
- Category validation.
- Budget creation and spending calculations.
- Savings-goal contributions.
- Database constraints.
- Authentication requirements.
- Ownership checks.
- Duplicate submissions.
- CSV export isolation.
- Analytics queries.
- Account deletion behaviour.

### End-to-end tests
Test these user journeys:
1. A new user registers and verifies their account.
2. The user logs in.
3. The user creates income and expense transactions.
4. The dashboard reflects the correct totals.
5. The user creates a monthly budget.
6. The budget reflects eligible expenses.
7. The user creates a savings goal.
8. The user records a contribution.
9. Analytics reflect the underlying records.
10. The user filters and exports transaction history.
11. The user edits and deletes a transaction.
12. The dashboard and reports update correctly.
13. The user logs out and loses access to protected pages.
14. A second user cannot read or modify the first user's records.

Also test malformed requests, unauthorized IDs, duplicate requests, empty datasets, large histories, and mobile layouts.

Do not claim tests have passed unless they were actually executed.

## 19. DEPLOYMENT AND ENVIRONMENT CONFIGURATION

Prepare the application for production deployment.

Provide:
- Local development instructions.
- Database setup.
- Database migrations.
- Environment variable documentation.
- Authentication callback configuration.
- Email provider setup.
- Development seed scripts.
- Test commands.
- Type-checking and linting commands.
- Production build verification.
- Deployment instructions.
- Database backup considerations.
- Error logging guidance.
- Known limitations.

Create `.env.example` with placeholder values only.

Validate required environment variables without printing secrets.

Never run uncontrolled destructive migrations against production.

Do not claim that deployment or external integrations work until they have been tested in the relevant environment.

## 20. DOCUMENTATION

Produce a professional README containing:
1. Project overview.
2. Features.
3. Technology stack.
4. Architecture overview.
5. Installation instructions.
6. Environment configuration.
7. Database migrations.
8. Local development.
9. Testing instructions.
10. Deployment guide.
11. Security controls.
12. Financial calculation definitions.
13. Known limitations.
14. Future improvements.

Also produce:
- Architecture diagram.
- Database entity-relationship diagram.
- Transaction lifecycle diagram.
- Financial metric definitions.
- Threat model.
- API/server-operation reference.
- Important architectural decisions and trade-offs.

Document which features are implemented, which require external configuration, and which remain future improvements.

## 21. DEVELOPMENT PHASES

Build the application incrementally. Do not attempt to produce the entire codebase in one unstructured generation.

### Phase 1: Planning and architecture
Inspect the repository and existing code.

Define: Application architecture; Database schema; Authentication model; Transaction lifecycle; Monetary representation; Financial calculation rules; Security boundaries; Testing strategy; Implementation roadmap.

Present the plan before making substantial changes.

### Phase 2: Foundation
Configure: Next.js and TypeScript; Tailwind CSS and design tokens; Database connection; Drizzle ORM; Authentication; Environment validation; Database migrations; Shared validation and error handling.

### Phase 3: Transaction engine
Implement: Transaction schema; Income and expense operations; Transaction validation; Exact monetary calculations; Transaction history; Editing and deletion; Ownership enforcement; Unit and integration tests.

Do not proceed until the financial core is reliable.

### Phase 4: Dashboard and analytics
Implement: Financial overview; Recent transactions; Date filters; Category breakdowns; Monthly trends; Income versus expenses; Accurate aggregate queries.

### Phase 5: Categories and budgets
Implement: Default and custom categories; Category management; Monthly budgets; Category budgets; Budget utilization; Budget history.

### Phase 6: Savings goals
Implement: Goal creation; Goal editing; Contributions; Progress tracking; Goal history; Completion and archival rules.

### Phase 7: Additional features
Where time and architecture permit, implement: CSV export; CSV import; Recurring transactions; Optional account tracking; Additional reporting filters.

Do not sacrifice core correctness to fit in every optional feature.

### Phase 8: UI refinement and accessibility
Refine: Responsive layouts; Typography; Forms; Tables; Charts; Empty states; Loading states; Error handling; Keyboard navigation; Reduced motion.

### Phase 9: Security and QA
Run the test suite.

Review: Authentication; Authorization; Cross-user isolation; Financial calculations; Duplicate submissions; Database constraints; Input validation; CSV safety; Rate limits; Caching; Security headers; Dependency vulnerabilities.

Fix discovered defects before declaring the application ready.

### Phase 10: Production readiness
Verify: Database migrations; Environment variables; Type checks; Linting; Unit tests; Integration tests; End-to-end tests; Production build; Deployment instructions; README completeness; Known limitations.

At the end of each phase, report what was implemented, files changed, tests actually run, remaining issues, and the next phase.

If a credential or external service is unavailable, document the limitation and continue with the parts that can be implemented and tested locally.

## 22. DEFINITION OF DONE

The project is complete only when:
- Users can register, log in, verify their accounts, reset passwords, and log out.
- Private operations enforce authentication and ownership.
- Users can create, edit, filter, and delete their transactions.
- Financial calculations use an exact monetary strategy.
- Currency and date handling follow documented rules.
- Dashboard values reflect real persisted records.
- Budgets calculate eligible spending correctly.
- Savings goals and contributions persist correctly.
- Analytics do not fabricate values or double-count transactions.
- Financial data is isolated between users.
- CSV export is safe and respects ownership.
- Responsive and accessible interfaces have been reviewed.
- Critical financial and security paths are tested.
- Database migrations and environment configuration are documented.
- The production build has been verified.
- The README explains how to run and deploy the project.
- Known limitations are disclosed honestly.

## FINAL INSTRUCTION

Begin with Phase 1. Inspect the repository, identify existing conventions, and produce the architecture, schema, monetary strategy, financial calculation definitions, security model, and phased implementation plan.

Then continue implementing the application phase by phase, using actual database persistence, reusable business logic, meaningful tests, and documented engineering decisions.

Do not stop at a visual prototype. Do not substitute fake financial records for a real backend. Do not claim functionality or tests are complete unless the implementation has been verified.

Build a product that demonstrates sound full-stack engineering and responsible handling of sensitive financial data.
