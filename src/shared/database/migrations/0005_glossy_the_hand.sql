ALTER TABLE "cars" DROP CONSTRAINT "cars_device_imei_unique";--> statement-breakpoint
DROP INDEX "idx_cars_device_imei";--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "car_number" varchar(20);--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "idx_cars_deleted_at" ON "cars" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "cars" DROP COLUMN "device_imei";--> statement-breakpoint
ALTER TABLE "cars" DROP COLUMN "device_model";--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_car_number_unique" UNIQUE("car_number");