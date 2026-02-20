CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cars" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"name" varchar(100) NOT NULL,
	"device_imei" varchar(20) NOT NULL,
	"device_model" varchar(50),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "cars_device_imei_unique" UNIQUE("device_imei")
);
--> statement-breakpoint
CREATE TABLE "car_positions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"car_id" bigint NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"speed" integer,
	"angle" integer,
	"satellites" integer,
	"ignition" boolean,
	"recorded_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "car_stop_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"car_id" bigint NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp,
	"duration_seconds" integer,
	"latitude" double precision,
	"longitude" double precision
);
--> statement-breakpoint
CREATE TABLE "car_engine_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"car_id" bigint NOT NULL,
	"event_type" varchar(8) NOT NULL,
	"event_at" timestamp NOT NULL,
	"latitude" double precision,
	"longitude" double precision
);
--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_positions" ADD CONSTRAINT "car_positions_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_stop_events" ADD CONSTRAINT "car_stop_events_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_engine_events" ADD CONSTRAINT "car_engine_events_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cars_device_imei" ON "cars" USING btree ("device_imei");--> statement-breakpoint
CREATE INDEX "idx_positions_car_recorded" ON "car_positions" USING btree ("car_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_positions_recorded_at" ON "car_positions" USING btree ("recorded_at");