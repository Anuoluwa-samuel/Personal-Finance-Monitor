CREATE TABLE "app_rate_limit" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer NOT NULL
);
