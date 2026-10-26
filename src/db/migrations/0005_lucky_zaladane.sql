CREATE TYPE "public"."goal_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "savings_contribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"contributed_on" date NOT NULL,
	"note" varchar(200),
	"idempotency_key" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_contribution_amount_range" CHECK ("savings_contribution"."amount" > 0 and "savings_contribution"."amount" < 1000000000000)
);
--> statement-breakpoint
CREATE TABLE "savings_goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(80) NOT NULL,
	"target" numeric(18, 4) NOT NULL,
	"starting_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"target_date" date,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_goal_target_range" CHECK ("savings_goal"."target" > 0 and "savings_goal"."target" < 1000000000000),
	CONSTRAINT "savings_goal_starting_range" CHECK ("savings_goal"."starting_amount" >= 0 and "savings_goal"."starting_amount" <= "savings_goal"."target"),
	CONSTRAINT "savings_goal_name_nonblank" CHECK (length(btrim("savings_goal"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "savings_contribution" ADD CONSTRAINT "savings_contribution_goal_id_savings_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."savings_goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_contribution" ADD CONSTRAINT "savings_contribution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "savings_contribution_user_idem_uq" ON "savings_contribution" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "savings_contribution_goal_date_idx" ON "savings_contribution" USING btree ("goal_id","contributed_on" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "savings_contribution_user_date_idx" ON "savings_contribution" USING btree ("user_id","contributed_on");--> statement-breakpoint
CREATE INDEX "savings_goal_user_status_idx" ON "savings_goal" USING btree ("user_id","status","created_at" DESC NULLS LAST);