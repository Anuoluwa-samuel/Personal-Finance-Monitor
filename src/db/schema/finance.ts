import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const flowType = pgEnum("flow_type", ["income", "expense"]);
export const recurringFrequency = pgEnum("recurring_frequency", ["weekly", "monthly", "yearly"]);
export const recurringStatus = pgEnum("recurring_status", ["active", "paused"]);
export const occurrenceStatus = pgEnum("occurrence_status", ["pending", "posted", "skipped"]);
export const goalStatus = pgEnum("goal_status", ["active", "completed", "archived"]);

/**
 * user_id NULL = system category (read-only, visible to everyone).
 * Names are unique per (owner, type) ignoring case, archived rows included, so
 * an archived name cannot be silently reused for a different meaning.
 */
export const category = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    type: flowType("type").notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    icon: varchar("icon", { length: 40 }),
    color: varchar("color", { length: 7 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("category_owner_type_name_uq").on(
      sql`coalesce(${t.userId}, '')`,
      t.type,
      sql`lower(${t.name})`,
    ),
    // Target of the composite FK that ties a transaction's kind to its category's type.
    uniqueIndex("category_id_type_uq").on(t.id, t.type),
    check("category_color_hex", sql`${t.color} is null or ${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

/**
 * A place money is kept (cash, a bank account, a wallet). Optional: transactions without an account still count
 * towards the overall recorded balance. Archived accounts keep their history. (The auth library owns a table
 * called "account", hence the name.) Transfers between accounts are NOT implemented; when they are, they must be
 * a separate kind so they never count as income or expense.
 */
export const moneyAccount = pgTable(
  "money_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    openingBalance: numeric("opening_balance", { precision: 18, scale: 4 }).notNull().default("0"),
    currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    check("money_account_opening_range", sql`${t.openingBalance} >= 0 and ${t.openingBalance} < 1000000000000`),
    check("money_account_name_nonblank", sql`length(btrim(${t.name})) > 0`),
    uniqueIndex("money_account_user_name_uq").on(t.userId, sql`lower(${t.name})`),
    // Target of the composite FK that makes "a transaction's account belongs to the same user" a database guarantee.
    uniqueIndex("money_account_id_user_uq").on(t.id, t.userId),
  ],
);

/**
 * Income and expense records. `kind` is an enum that can later gain 'transfer'
 * without disturbing income/expense queries, which always filter on kind.
 * Deleting a category that has history is blocked (NO ACTION, checked at end of statement so a user-delete cascade still works); archive instead.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: flowType("kind").notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
    description: varchar("description", { length: 200 }).notNull(),
    categoryId: uuid("category_id").notNull(),
    accountId: uuid("account_id"),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    notes: varchar("notes", { length: 1000 }),
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.categoryId, t.kind],
      foreignColumns: [category.id, category.type],
      name: "transactions_category_kind_fk",
    }).onDelete("no action"),
    foreignKey({
      columns: [t.accountId, t.userId],
      foreignColumns: [moneyAccount.id, moneyAccount.userId],
      name: "transactions_account_owner_fk",
    }).onDelete("no action"),
    check("transactions_amount_positive", sql`${t.amount} > 0`),
    check("transactions_amount_max", sql`${t.amount} < 1000000000000`),
    check("transactions_description_nonblank", sql`length(btrim(${t.description})) > 0`),
    uniqueIndex("transactions_user_idem_uq").on(t.userId, t.idempotencyKey),
    index("transactions_user_date_idx").on(t.userId, t.transactionDate.desc(), t.id),
    index("transactions_user_account_date_idx").on(t.userId, t.accountId, t.transactionDate),
    index("transactions_user_category_date_idx").on(t.userId, t.categoryId, t.transactionDate),
  ],
);

/** One row per user, created lazily with defaults. `timezone` decides what "today" means for report periods. */
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Africa/Lagos"),
  theme: varchar("theme", { length: 10 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * A monthly spending plan. `month` is always the first day of the month. At most one ACTIVE budget per user per
 * month (archived ones stay as history and free the month up). `overall_limit` caps all expenses in the month;
 * lines cap individual categories. Either may be absent but not both (enforced in the service).
 */
export const budget = pgTable(
  "budget",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    month: date("month", { mode: "string" }).notNull(),
    overallLimit: numeric("overall_limit", { precision: 18, scale: 4 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    check("budget_month_first_day", sql`extract(day from ${t.month}) = 1`),
    check("budget_overall_positive", sql`${t.overallLimit} is null or (${t.overallLimit} > 0 and ${t.overallLimit} < 1000000000000)`),
    uniqueIndex("budget_user_month_active_uq").on(t.userId, t.month).where(sql`${t.archivedAt} is null`),
    index("budget_user_month_idx").on(t.userId, t.month.desc()),
  ],
);

/** Per-category limit. `type` is pinned to 'expense' and joined to the category by composite FK, so income categories cannot be budgeted. */
export const budgetLine = pgTable(
  "budget_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull(),
    type: flowType("type").notNull().default("expense"),
    limit: numeric("limit", { precision: 18, scale: 4 }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.categoryId, t.type],
      foreignColumns: [category.id, category.type],
      name: "budget_line_category_type_fk",
      // CASCADE, not NO ACTION: with NO ACTION, deleting a user whose custom category is used in a budget line
      // fails, because the category check runs before the budget -> budget_line cascade completes.
    }).onDelete("cascade"),
    check("budget_line_expense_only", sql`${t.type} = 'expense'`),
    check("budget_line_limit_positive", sql`${t.limit} > 0 and ${t.limit} < 1000000000000`),
    uniqueIndex("budget_line_budget_category_uq").on(t.budgetId, t.categoryId),
  ],
);

/**
 * A personal savings target. Contributions are PLANNING records: they do not verify that money moved anywhere,
 * and they never touch income, expenses, balance or budgets. Progress = starting_amount + sum(contributions),
 * and the service keeps it <= target (no overfunding) by locking the goal row while contributing.
 */
export const savingsGoal = pgTable(
  "savings_goal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    target: numeric("target", { precision: 18, scale: 4 }).notNull(),
    startingAmount: numeric("starting_amount", { precision: 18, scale: 4 }).notNull().default("0"),
    targetDate: date("target_date", { mode: "string" }),
    currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
    status: goalStatus("status").notNull().default("active"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    check("savings_goal_target_range", sql`${t.target} > 0 and ${t.target} < 1000000000000`),
    check("savings_goal_starting_range", sql`${t.startingAmount} >= 0 and ${t.startingAmount} <= ${t.target}`),
    check("savings_goal_name_nonblank", sql`length(btrim(${t.name})) > 0`),
    index("savings_goal_user_status_idx").on(t.userId, t.status, t.createdAt.desc()),
  ],
);

export const savingsContribution = pgTable(
  "savings_contribution",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => savingsGoal.id, { onDelete: "cascade" }),
    // Denormalised owner so period summaries and ownership checks never need the goal join.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    contributedOn: date("contributed_on", { mode: "string" }).notNull(),
    note: varchar("note", { length: 200 }),
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("savings_contribution_amount_range", sql`${t.amount} > 0 and ${t.amount} < 1000000000000`),
    uniqueIndex("savings_contribution_user_idem_uq").on(t.userId, t.idempotencyKey),
    index("savings_contribution_goal_date_idx").on(t.goalId, t.contributedOn.desc(), t.createdAt.desc()),
    index("savings_contribution_user_date_idx").on(t.userId, t.contributedOn),
  ],
);

/**
 * Staging area for CSV imports: the server stores the rows IT validated at preview time, and the confirm step
 * writes exactly those rows. The client only ever sends a batch id, so it cannot alter what gets committed.
 */
export const importBatch = pgTable(
  "import_batch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 200 }).notNull(),
    rows: jsonb("rows").$type<StagedRow[]>().notNull(),
    rowCount: integer("row_count").notNull(),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (t) => [index("import_batch_user_idx").on(t.userId, t.createdAt.desc())],
);

export type StagedRow = {
  key: string;
  kind: "income" | "expense";
  amount: string;
  description: string;
  categoryId: string;
  accountId?: string | null;
  transactionDate: string;
  notes: string | null;
};

/**
 * A repeating income or expense (rent, salary, a subscription). A rule never creates real transactions by itself:
 * when an occurrence falls due the job records a PLANNED occurrence, and only the user's confirmation turns it
 * into a transaction. `next_index` is the index of the next occurrence to generate; dates are computed from the
 * start date (not by repeatedly adding) so month-end clamping never drifts.
 */
export const recurringRule = pgTable(
  "recurring_rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: flowType("kind").notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    description: varchar("description", { length: 200 }).notNull(),
    categoryId: uuid("category_id").notNull(),
    accountId: uuid("account_id"),
    frequency: recurringFrequency("frequency").notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    nextIndex: integer("next_index").notNull().default(0),
    status: recurringStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.categoryId, t.kind], foreignColumns: [category.id, category.type], name: "recurring_rule_category_kind_fk" }).onDelete("no action"),
    foreignKey({ columns: [t.accountId, t.userId], foreignColumns: [moneyAccount.id, moneyAccount.userId], name: "recurring_rule_account_owner_fk" }).onDelete("no action"),
    check("recurring_rule_amount_range", sql`${t.amount} > 0 and ${t.amount} < 1000000000000`),
    check("recurring_rule_interval_range", sql`${t.intervalCount} between 1 and 52`),
    check("recurring_rule_end_after_start", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    check("recurring_rule_description_nonblank", sql`length(btrim(${t.description})) > 0`),
    index("recurring_rule_user_idx").on(t.userId, t.status),
  ],
);

/** One scheduled date of a rule. The unique key is what makes generation idempotent. */
export const recurringOccurrence = pgTable(
  "recurring_occurrence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => recurringRule.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scheduledFor: date("scheduled_for", { mode: "string" }).notNull(),
    status: occurrenceStatus("status").notNull().default("pending"),
    // If the user later deletes the transaction, the occurrence stays as a record that it was once confirmed.
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("recurring_occurrence_rule_date_uq").on(t.ruleId, t.scheduledFor),
    index("recurring_occurrence_user_status_idx").on(t.userId, t.status, t.scheduledFor),
  ],
);

/**
 * Fixed-window counters for application-level rate limits (writes, export, import, per-email auth limits).
 * Stored in Postgres so limits hold across serverless instances. Separate from the auth library's own table.
 */
export const appRateLimit = pgTable("app_rate_limit", {
  key: varchar("key", { length: 200 }).primaryKey(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
  count: integer("count").notNull(),
});
