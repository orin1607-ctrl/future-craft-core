export type NotificationLogSearch = {
  vehicleId?: string;
  vehiclePlate?: string;
  driverId?: string;
  driverName?: string;
  tab?: string;
};

export function buildNotificationLogUrl(params: NotificationLogSearch = {}): string {
  const q = new URLSearchParams();
  if (params.vehicleId) q.set('vehicleId', params.vehicleId);
  if (params.vehiclePlate) q.set('plate', params.vehiclePlate);
  if (params.driverId) q.set('driverId', params.driverId);
  if (params.driverName) q.set('driverName', params.driverName);
  if (params.tab) q.set('tab', params.tab);
  const qs = q.toString();
  return `/alerts/log${qs ? `?${qs}` : ''}`;
}
