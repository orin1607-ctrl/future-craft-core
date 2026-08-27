import { useAuth } from '@/contexts/AuthContext';
import { TelemarketingAdminScreen } from '@/features/telemarketing/pages/TelemarketingAdminScreen';
import { useTeleEntryMode } from '@/features/telemarketing/hooks/useTeleEntryMode';

export default function TelemarketingAdminPage() {
  const { user } = useAuth();
  const entry = useTeleEntryMode(user?.id || '', user?.role);
  if (!user) return null;
  return (
    <TelemarketingAdminScreen
      currentManagerId={user.id}
      currentManagerName={user.full_name}
      inspect={entry.adminInspect}
      onToggleInspect={() => entry.setAdminInspectOn(!entry.adminInspect)}
      onTurnOffInspect={() => entry.setAdminInspectOn(false)}
    />
  );
}
