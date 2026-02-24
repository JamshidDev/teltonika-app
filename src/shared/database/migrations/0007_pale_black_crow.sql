ALTER TABLE "car_positions" ADD COLUMN "driver_id" bigint;--> statement-breakpoint
ALTER TABLE "car_positions" ADD COLUMN "device_id" bigint;--> statement-breakpoint
ALTER TABLE "car_positions" ADD CONSTRAINT "car_positions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_positions" ADD CONSTRAINT "car_positions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;