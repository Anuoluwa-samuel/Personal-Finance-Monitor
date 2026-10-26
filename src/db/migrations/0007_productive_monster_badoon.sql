CREATE TABLE "money_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(60) NOT NULL,
	"opening_balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_account_opening_range" CHECK ("money_account"."opening_balance" >= 0 and "money_account"."opening_balance" < 1000000000000),
	CONSTRAINT "money_account_name_nonblank" CHECK (length(btrim("money_account"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "money_account" ADD CONSTRAINT "money_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "money_account_user_name_uq" ON "money_account" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "money_account_id_user_uq" ON "money_account" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_owner_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."money_account"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_user_account_date_idx" ON "transactions" USING btree ("user_id","account_id","transaction_date");