ALTER TABLE "budget_line" DROP CONSTRAINT "budget_line_category_type_fk";
--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_category_type_fk" FOREIGN KEY ("category_id","type") REFERENCES "public"."category"("id","type") ON DELETE cascade ON UPDATE no action;