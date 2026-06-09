import { Link } from 'react-router-dom';
import { ArrowRight, Car, LayoutDashboard } from 'lucide-react';
import { buildVehicleHubUrl } from '@/lib/entityNavContext';
import { EntityContextBanner } from '@/components/EntityContextBanner';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface VehicleScopedNavChromeProps {
  vehicleId?: string;
  plate?: string;
  pageLabel: string;
  /** When false, renders nothing (e.g. non-scoped list view) */
  active?: boolean;
}

const navBtnClass =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm font-medium min-h-[44px] hover:bg-muted transition-colors';

/**
 * Breadcrumb + quick nav for pages opened from vehicle hub card.
 * דשבורד > מעקב רכבים > רכב {plate} > {pageLabel}
 */
export default function VehicleScopedNavChrome({
  vehicleId,
  plate,
  pageLabel,
  active = true,
}: VehicleScopedNavChromeProps) {
  if (!active || !plate) return null;

  const hubUrl = vehicleId ? buildVehicleHubUrl(vehicleId) : null;
  const vehicleLabel = `רכב ${plate}`;

  return (
    <div className="mb-4 space-y-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">דשבורד</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/vehicles">מעקב רכבים</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {hubUrl && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={hubUrl}>{vehicleLabel}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap gap-2">
        {hubUrl && (
          <Link to={hubUrl} className={`${navBtnClass} text-primary border-primary/30`}>
            <ArrowRight size={16} />
            חזרה לכרטיס הרכב
          </Link>
        )}
        <Link to="/dashboard" className={navBtnClass}>
          <LayoutDashboard size={16} />
          דשבורד ראשי
        </Link>
        <Link to="/vehicles" className={navBtnClass}>
          <Car size={16} />
          מעקב רכבים
        </Link>
      </div>

      <EntityContextBanner label={vehicleLabel} strict />
    </div>
  );
}
