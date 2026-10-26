CREATE TABLE "budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"month" date NOT NULL,
	"overall_limit" numeric(18, 4),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_month_first_day" CHECK (extract(day from "budget"."month") = 1),
	CONSTRAINT "budget_overall_positive" CHECK ("budget"."overall_limit" is null or ("budget"."overall_limit" > 0 and "budget"."overall_limit" < 1000000000000))
);
--> statement-breakpoint
CREATE TABLE "budget_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"type" "flow_type" DEFAULT 'expense' NOT NULL,
	"limit" numeric(18, 4) NOT NULL,
	CONSTRAINT "budget_line_expense_only" CHECK ("budget_line"."type" = 'expense'),
	CONSTRAINT "budget_line_limit_positive" CHECK ("budget_line"."limit" > 0 and "budget_line"."limit" < 1000000000000)
);
--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_category_type_fk" FOREIGN KEY ("category_id","type") REFERENCES "public"."category"("id","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_user_month_active_uq" ON "budget" USING btree ("user_id","month") WHERE "budget"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "budget_user_month_idx" ON "budget" USING btree ("user_id","month" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "budget_line_budget_category_uq" ON "budget_line" USING btree ("budget_id","category_id");