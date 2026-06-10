import { Upload, Archive, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VehiclePlateLine } from '@/components/vehicles/vehiclePlateDisplay';
import NotificationsAndSendsButton from '@/components/notifications/NotificationsAndSendsButton';

export default function VehicleHubBottomActions({
  plate,
  internalNumber,
  vehicleId,
  isManager,
  isArchived,
  onImport,
  onArchive,
  onDelete,
  previewMode,
}: {
  plate: string;
  internalNumber: string;
  vehicleId?: string;
  isManager: boolean;
  isArchived: boolean;
  onImport: () => void;
  onArchive: () => void;
  onDelete: () => void;
  previewMode?: boolean;
}) {
  return (
    <div className="mt-6 pt-4 border-t-2 border-border">
      <p className="text-xs text-muted-foreground text-center mb-2">
        פעולות קבועות · <VehiclePlateLine plate={plate} internal={internalNumber} />
      </p>
      {isManager && vehicleId && (
        <div className="mb-3">
          <NotificationsAndSendsButton vehicleId={vehicleId} vehiclePlate={plate} />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full font-bold h-12"
          onClick={onImport}
        >
          <Upload size={18} className="ml-2 shrink-0" />
          יבוא רכב
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full font-bold h-12 border-warning text-warning"
          disabled={!isManager || isArchived}
          onClick={onArchive}
        >
          <Archive size={18} className="ml-2 shrink-0" />
          ארכיון רכב
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full font-bold h-12 border-destructive text-destructive"
          disabled={!isManager}
          onClick={onDelete}
        >
          <Trash2 size={18} className="ml-2 shrink-0" />
          מחק רכב
        </Button>
      </div>
      {!isManager && !previewMode && (
        <p className="text-[10px] text-center text-muted-foreground mt-2">ארכיון ומחיקה — מנהל צי בלבד</p>
      )}
    </div>
  );
}
