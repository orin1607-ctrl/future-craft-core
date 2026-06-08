import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buildVehicleHubUrl } from '@/lib/entityNavContext';

export default function VehicleBackToCardButton({ vehicleId }: { vehicleId?: string }) {
  if (!vehicleId) return null;
  return (
    <Link
      to={buildVehicleHubUrl(vehicleId)}
      className="inline-flex items-center gap-2 text-primary text-sm font-medium mb-4 min-h-[44px]"
    >
      <ArrowRight size={18} /> חזרה לכרטיס הרכב
    </Link>
  );
}
