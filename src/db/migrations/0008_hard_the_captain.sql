CREATE TYPE "public"."occurrence_status" AS ENUM('pending', 'posted', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TABLE "recurring_occurrence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"scheduled_for" date NOT NULL,
	"status" "occurrence_status" DEFAULT 'pending' NOT NULL,
	"transaction_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "flow_type" NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"description" varchar(200) NOT NULL,
	"category_id" uuid NOT NULL,
	"account_id" uuid,
	"frequency" "recurring_frequency" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_index" integer DEFAULT 0 NOT NULL,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_rule_amount_range" CHECK ("recurring_rule"."amount" > 0 and "recurring_rule"."amount" < 1000000000000),
	CONSTRAINT "recurring_rule_interval_range" CHECK ("recurring_rule"."interval_count" between 1 and 52),
	CONSTRAINT "recurring_rule_end_after_start" CHECK ("recurring_rule"."end_date" is null or "recurring_rule"."end_date" >= "recurring_rule"."start_date"),
	CONSTRAINT "recurring_rule_description_nonblank" CHECK (length(btrim("recurring_rule"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "recurring_occurrence" ADD CONSTRAINT "recurring_occurrence_rule_id_recurring_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."recurring_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrence" ADD CONSTRAINT "recurring_occurrence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrence" ADD CONSTRAINT "recurring_occurrence_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rule" ADD CONSTRAINT "recurring_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rule" ADD CONSTRAINT "recurring_rule_category_kind_fk" FOREIGN KEY ("category_id","kind") REFERENCES "public"."category"("id","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rule" ADD CONSTRAINT "recurring_rule_account_owner_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."money_account"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_occurrence_rule_date_uq" ON "recurring_occurrence" USING btree ("rule_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "recurring_occurrence_user_status_idx" ON "recurring_occurrence" USING btree ("user_id","status","scheduled_for");--> statement-breakpoint
CREATE INDEX "recurring_rule_user_idx" ON "recurring_rule" USING btree ("user_id","status");