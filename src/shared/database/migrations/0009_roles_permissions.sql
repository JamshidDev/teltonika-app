-- Rollar va permission tizimi. Idempotent — qayta ishga tushirish xavfsiz.
CREATE TABLE IF NOT EXISTS "roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint

INSERT INTO "roles" ("name", "permissions", "is_system") VALUES
  ('SuperAdmin', ARRAY['*'], true),
  ('Admin', ARRAY[
    'map:read','history:read','reports:read','engine-events:read','stop-events:read',
    'vehicles:read','vehicles:edit','vehicles:delete',
    'drivers:read','drivers:edit','drivers:delete',
    'devices:read','devices:edit','devices:delete',
    'settings:read','settings:edit'
  ], false),
  -- Xarita sahifasi /car/last-positions ni chaqiradi — vehicles:read shart.
  ('MapViewer', ARRAY['map:read','history:read','vehicles:read'], false)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint

-- 1-qadam: nullable ustun (mavjud qatorlar yiqilmasligi uchun).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role_id" bigint;
--> statement-breakpoint

-- 2-qadam: backfill — id=1 SuperAdmin, qolganlari MapViewer.
UPDATE "users" SET "role_id" = (SELECT id FROM roles WHERE name = 'SuperAdmin')
  WHERE "id" = 1 AND "role_id" IS NULL;
--> statement-breakpoint

UPDATE "users" SET "role_id" = (SELECT id FROM roles WHERE name = 'MapViewer')
  WHERE "role_id" IS NULL;
--> statement-breakpoint

-- 3-qadam: endi NOT NULL qo'yish xavfsiz.
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;
--> statement-breakpoint

-- FK: ADD CONSTRAINT da IF NOT EXISTS yo'q — qayta ishga tushirish uchun guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_id_roles_id_fk'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk"
      FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
