import { plateMatches } from '@/lib/entityNavContext';
import { isCustomGapTask, isHistoryLogTask } from '@/lib/vehicleEventLog';

/** Statuses that count as an open ליקוי — shared by card, tracking, and ניהול ליקויים. */
export const OPEN_DEFECT_STATUSES = ['open', 'in_progress', 'pending', 'פתוח', 'בטיפול'] as const;

export type DefectTaskLike = {
  id?: string | null;
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
  title?: string | null;
  status?: string | null;
};

export function isOpenDefectStatus(status: string | null | undefined): boolean {
  const s = (status || '').trim();
  if (!s) return false;
  return (OPEN_DEFECT_STATUSES as readonly string[]).includes(s);
}

/** True for a real open defect — not a history log and not a custom "חוסר:" gap. */
export function isOpenDefectTask(task: DefectTaskLike): boolean {
  if (isHistoryLogTask(task) || isCustomGapTask(task)) return false;
  return isOpenDefectStatus(task.status);
}

export function taskBelongsToVehicle(
  task: DefectTaskLike,
  vehicle: { id?: string | null; plate?: string | null },
): boolean {
  if (vehicle.id && task.vehicle_id && task.vehicle_id === vehicle.id) return true;
  return plateMatches(task.vehicle_plate, vehicle.plate);
}

export function filterOpenDefectsForVehicle<T extends DefectTaskLike>(
  tasks: T[],
  vehicle: { id?: string | null; plate?: string | null },
): T[] {
  return tasks.filter((t) => taskBelongsToVehicle(t, vehicle) && isOpenDefectTask(t));
}

export function countOpenDefects(
  tasks: DefectTaskLike[],
  vehicle: { id?: string | null; plate?: string | null },
): number {
  return filterOpenDefectsForVehicle(tasks, vehicle).length;
}

export function isDefectListTask(task: DefectTaskLike): boolean {
  return !isHistoryLogTask(task) && !isCustomGapTask(task);
}

export function openDefectLabel(count: number): string {
  if (count === 1) return '1 ליקוי פתוח';
  return `${count} ליקויים פתוחים`;
}
