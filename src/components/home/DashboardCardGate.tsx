import type { ComponentProps } from 'react';
import HomeWorldCard from '@/components/home/HomeWorldCard';
import { useDashboardCardVisible } from '@/hooks/useDashboardCardVisibility';

type HomeWorldCardProps = ComponentProps<typeof HomeWorldCard>;

interface DashboardCardGateProps extends HomeWorldCardProps {
  path: string;
}

/** Renders a dashboard card only when company settings allow it. */
export default function DashboardCardGate({ path, ...cardProps }: DashboardCardGateProps) {
  const visible = useDashboardCardVisible(path);
  if (!visible) return null;
  return <HomeWorldCard {...cardProps} />;
}
