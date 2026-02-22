import { defineRelations } from 'drizzle-orm';
import * as schema from '../schema/index';

export const relations = defineRelations(schema, (r) => ({
  users: {
    cars: r.many.cars({
      from: r.users.id,
      to: r.cars.userId,
    }),
  },

  cars: {
    user: r.one.users({
      from: r.cars.userId,
      to: r.users.id,
    }),
    positions: r.many.carPositions({
      from: r.cars.id,
      to: r.carPositions.carId,
    }),
    lastPosition: r.one.carLastPositions({
      from: r.cars.id,
      to: r.carLastPositions.carId,
    }),
    stopEvents: r.many.carStopEvents({
      from: r.cars.id,
      to: r.carStopEvents.carId,
    }),
    engineEvents: r.many.carEngineEvents({
      from: r.cars.id,
      to: r.carEngineEvents.carId,
    }),
  },

  carPositions: {
    car: r.one.cars({
      from: r.carPositions.carId,
      to: r.cars.id,
    }),
  },

  carLastPositions: {
    car: r.one.cars({
      from: r.carLastPositions.carId,
      to: r.cars.id,
    }),
  },

  carStopEvents: {
    car: r.one.cars({
      from: r.carStopEvents.carId,
      to: r.cars.id,
    }),
  },

  carEngineEvents: {
    car: r.one.cars({
      from: r.carEngineEvents.carId,
      to: r.cars.id,
    }),
  },
}));
