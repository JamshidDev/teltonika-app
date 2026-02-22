CREATE TABLE "car_last_positions" (
	"car_id" bigint NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"speed" integer,
	"angle" integer,
	"altitude" integer,
	"satellites" integer,
	"ignition" boolean,
	"movement" boolean,
	"odometer" bigint,
	"gsm_signal" integer,
	"battery_voltage" integer,
	"ext_voltage" integer,
	"recorded_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "car_last_positions_car_id_unique" UNIQUE("car_id")
);
--> statement-breakpoint
ALTER TABLE "car_last_positions" ADD CONSTRAINT "car_last_positions_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_last_pos_ignition" ON "car_last_positions" USING btree ("ignition");--> statement-breakpoint
CREATE INDEX "idx_last_pos_movement" ON "car_last_positions" USING btree ("movement");--> statement-breakpoint
CREATE INDEX "idx_last_pos_recorded_at" ON "car_last_positions" USING btree ("recorded_at");