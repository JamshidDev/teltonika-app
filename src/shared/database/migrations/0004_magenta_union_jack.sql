CREATE TABLE "drivers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"phone" varchar(20),
	"license_number" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "drivers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "drivers_license_number_unique" UNIQUE("license_number")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"imei" varchar(20) NOT NULL,
	"model" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "devices_imei_unique" UNIQUE("imei")
);
--> statement-breakpoint
CREATE TABLE "car_devices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"car_id" bigint NOT NULL,
	"device_id" bigint NOT NULL,
	"start_at" timestamp DEFAULT now() NOT NULL,
	"end_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "car_drivers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"car_id" bigint NOT NULL,
	"driver_id" bigint NOT NULL,
	"start_at" timestamp DEFAULT now() NOT NULL,
	"end_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "car_devices" ADD CONSTRAINT "car_devices_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_devices" ADD CONSTRAINT "car_devices_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_drivers" ADD CONSTRAINT "car_drivers_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_drivers" ADD CONSTRAINT "car_drivers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_drivers_phone" ON "drivers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_drivers_license" ON "drivers" USING btree ("license_number");--> statement-breakpoint
CREATE INDEX "idx_drivers_deleted_at" ON "drivers" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_devices_imei" ON "devices" USING btree ("imei");--> statement-breakpoint
CREATE INDEX "idx_devices_deleted_at" ON "devices" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_car_devices_car_id" ON "car_devices" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "idx_car_devices_device_id" ON "car_devices" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_car_devices_active" ON "car_devices" USING btree ("car_id","end_at");--> statement-breakpoint
CREATE INDEX "idx_car_drivers_car_id" ON "car_drivers" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "idx_car_drivers_driver_id" ON "car_drivers" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_car_drivers_active" ON "car_drivers" USING btree ("car_id","end_at");