import { defineRelations } from 'drizzle-orm';
import * as schema from '../schema/index';

export const relations = defineRelations(schema, (r) => ({
  users: {
    cars: r.many.cars({
      from: r.users.id,
      to: r.cars.userId,
    }),
  },

  drivers: {
    carDrivers: r.many.carDrivers({
      from: r.drivers.id,
      to: r.carDrivers.driverId,
    }),
    positions: r.many.carPositions({
      from: r.drivers.id,
      to: r.carPositions.driverId,
    }),
  },

  devices: {
    carDevices: r.many.carDevices({
      from: r.devices.id,
      to: r.carDevices.deviceId,
    }),
    positions: r.many.carPositions({
      from: r.devices.id,
      to: r.carPositions.deviceId,
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
    drivers: r.many.carDrivers({
      from: r.cars.id,
      to: r.carDrivers.carId,
    }),
    devices: r.many.carDevices({
      from: r.cars.id,
      to: r.carDevices.carId,
    }),
  },

  carDrivers: {
    car: r.one.cars({
      from: r.carDrivers.carId,
      to: r.cars.id,
    }),
    driver: r.one.drivers({
      from: r.carDrivers.driverId,
      to: r.drivers.id,
    }),
  },

  carDevices: {
    car: r.one.cars({
      from: r.carDevices.carId,
      to: r.cars.id,
    }),
    device: r.one.devices({
      from: r.carDevices.deviceId,
      to: r.devices.id,
    }),
  },

  carPositions: {
    car: r.one.cars({
      from: r.carPositions.carId,
      to: r.cars.id,
    }),
    driver: r.one.drivers({
      from: r.carPositions.driverId,
      to: r.drivers.id,
    }),
    device: r.one.devices({
      from: r.carPositions.deviceId,
      to: r.devices.id,
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