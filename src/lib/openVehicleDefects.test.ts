import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  countOpenDefects,
  filterOpenDefectsForVehicle,
  isOpenDefectTask,
  openDefectLabel,
  taskBelongsToVehicle,
} from './openVehicleDefects';

const vehicle = { id: 'veh-77', plate: '12-345-67' };

describe('openVehicleDefects', () => {
  it('counts only real open defects for the vehicle, not faults-as-tasks mix-ins', () => {
    const tasks = [
      { id: '1', vehicle_id: 'veh-77', vehicle_plate: '1234567', title: 'בלמים', status: 'open' },
      { id: '2', vehicle_id: 'veh-77', vehicle_plate: '12-345-67', title: 'אורות', status: 'in_progress' },
      { id: '3', vehicle_id: 'veh-77', vehicle_plate: '12-345-67', title: 'צמיג', status: 'pending' },
      { id: '4', vehicle_id: 'veh-77', vehicle_plate: '12-345-67', title: 'ישן', status: 'resolved' },
      { id: '5', vehicle_id: 'veh-77', vehicle_plate: '12-345-67', title: '__veh_evt__:עריכה', status: 'history_log' },
      { id: '6', vehicle_id: 'veh-77', vehicle_plate: '12-345-67', title: 'חוסר:מפתח', status: 'open' },
      { id: '7', vehicle_id: 'other', vehicle_plate: '999-99-999', title: 'אחר', status: 'open' },
    ];
    expect(countOpenDefects(tasks, vehicle)).toBe(3);
    expect(filterOpenDefectsForVehicle(tasks, vehicle).map((t) => t.id)).toEqual(['1', '2', '3']);
  });

  it('matches by vehicle_id even when the plate format differs', () => {
    expect(
      taskBelongsToVehicle(
        { vehicle_id: 'veh-77', vehicle_plate: '1234567', title: 'x', status: 'open' },
        vehicle,
      ),
    ).toBe(true);
    expect(isOpenDefectTask({ title: 'בלמים', status: 'בטיפול' })).toBe(true);
    expect(isOpenDefectTask({ title: 'בלמים', status: 'resolved' })).toBe(false);
  });

  it('does not hide the open-defect number', () => {
    expect(openDefectLabel(0)).toBe('0 ליקויים פתוחים');
    expect(openDefectLabel(1)).toBe('1 ליקוי פתוח');
    expect(openDefectLabel(3)).toBe('3 ליקויים פתוחים');
  });
});

describe('oren car round-2 display', () => {
  it('hides the Documents טסט category button without removing other vehicle docs', () => {
    const src = readFileSync('src/pages/Documents.tsx', 'utf8');
    expect(src).toContain("label: 'רישיונות רכב'");
    expect(src).toContain("label: 'ביטוח חובה'");
    expect(src).toContain("label: 'ביטוח מקיף'");
    expect(src).toContain("label: 'ביטוח צד ג׳'");
    expect(src).toContain("key: 'test'");
    expect(src).toMatch(/visibleVehicleDocs = vehicleDocs\.filter\(\(c\) => c\.key !== 'test'\)/);
  });

  it('keeps טיפולים and תאונות report buttons and hides the detailed duplicates', () => {
    const src = readFileSync('src/pages/Reports.tsx', 'utf8');
    expect(src).toContain("{ value: 'ops_treatments', label: 'טיפולים' }");
    expect(src).toContain("{ value: 'ops_accidents', label: 'תאונות' }");
    expect(src).not.toContain("label: 'טיפולים (מפורט)'");
    expect(src).not.toContain("label: 'תאונות (מפורט)'");
    expect(src).toContain("label: 'פתוחות'");
    expect(src).toContain("label: 'דחופות'");
    expect(src).toContain("label: 'עלות משוערת'");
  });

  it('labels the hub defects button as ניהול ליקויים with the open count', () => {
    const src = readFileSync('src/components/vehicles/VehicleHub.tsx', 'utf8');
    expect(src).toContain("label: 'ניהול ליקויים'");
    expect(src).toContain("path: '/vehicle-tasks'");
    expect(src).toContain('openDefectLabel');
  });
});
