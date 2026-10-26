CREATE TYPE "public"."flow_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"type" "flow_type" NOT NULL,
	"name" varchar(60) NOT NULL,
	"icon" varchar(40),
	"color" varchar(7),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_color_hex" CHECK ("category"."color" is null or "category"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "flow_type" NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"description" varchar(200) NOT NULL,
	"category_id" uuid NOT NULL,
	"transaction_date" date NOT NULL,
	"notes" varchar(1000),
	"idempotency_key" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0),
	CONSTRAINT "transactions_amount_max" CHECK ("transactions"."amount" < 1000000000000),
	CONSTRAINT "transactions_description_nonblank" CHECK (length(btrim("transactions"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_owner_type_name_uq" ON "category" USING btree (coalesce("user_id", ''),"type",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "category_id_type_uq" ON "category" USING btree ("id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_idem_uq" ON "transactions" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","transaction_date" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "transactions_user_category_date_idx" ON "transactions" USING btree ("user_id","category_id","transaction_date");
--> statement-breakpoint
-- Hand-edited: this FK must come after category_id_type_uq, the unique index it references.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_kind_fk" FOREIGN KEY ("category_id","kind") REFERENCES "public"."category"("id","type") ON DELETE no action ON UPDATE no action;
