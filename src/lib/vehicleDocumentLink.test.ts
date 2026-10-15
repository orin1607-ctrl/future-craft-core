import { describe, expect, it } from 'vitest';
import {
  documentMatchesVehicle,
  internalNumberIdentifiesVehicle,
  type VehicleIdentity,
} from './vehicleDocumentLink';

const vehicle: VehicleIdentity = {
  id: 'veh-1',
  licensePlate: '12-345-67',
  internalNumber: '72',
  companyName: 'קיבוץ בארי',
};

describe('documentMatchesVehicle', () => {
  it('matches the license plate inside the same company', () => {
    expect(documentMatchesVehicle({
      companyName: 'קיבוץ בארי',
      vehiclePlate: '1234567',
    }, vehicle, false)).toBe(true);
  });

  it('rejects the same plate from another company', () => {
    expect(documentMatchesVehicle({
      companyName: 'חברה אחרת',
      vehiclePlate: '12-345-67',
    }, vehicle, true)).toBe(false);
  });

  it('rejects an internal number unless it uniquely identifies this vehicle in the company', () => {
    expect(documentMatchesVehicle({
      companyName: 'קיבוץ בארי',
      vehiclePlate: '72',
    }, vehicle, false)).toBe(false);
    expect(documentMatchesVehicle({
      companyName: 'קיבוץ בארי',
      vehiclePlate: '72',
    }, vehicle, true)).toBe(true);
  });

  it('rejects a document with no company unless it is bound to this vehicle id', () => {
    expect(documentMatchesVehicle({
      vehiclePlate: '12-345-67',
    }, vehicle, true)).toBe(false);
    expect(documentMatchesVehicle({
      entityType: 'vehicle',
      entityId: 'veh-1',
    }, vehicle, false)).toBe(true);
    expect(documentMatchesVehicle({
      companyName: 'חברה אחרת',
      entityType: 'vehicle',
      entityId: 'veh-1',
    }, vehicle, false)).toBe(false);
  });
});

describe('internalNumberIdentifiesVehicle', () => {
  it('is true only when one vehicle in the company carries that number', () => {
    expect(internalNumberIdentifiesVehicle(vehicle, [
      vehicle,
      { id: 'veh-2', licensePlate: '99-999-99', internalNumber: '80', companyName: 'קיבוץ בארי' },
    ])).toBe(true);
    expect(internalNumberIdentifiesVehicle(vehicle, [
      vehicle,
      { id: 'veh-2', licensePlate: '72', internalNumber: '80', companyName: 'קיבוץ בארי' },
    ])).toBe(false);
  });
});
