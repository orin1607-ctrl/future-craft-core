import { useAuth } from '@/contexts/AuthContext';
import { TelemarketingAgentScreen } from '@/features/telemarketing/pages/TelemarketingAgentScreen';
import { EntryPurposeScreen } from '@/features/telemarketing/components/EntryPurpose/EntryPurposeScreen';
import { useTeleEntryMode } from '@/features/telemarketing/hooks/useTeleEntryMode';

export default function TelemarketingAgentPage() {
  const { user } = useAuth();
  const entry = useTeleEntryMode(user?.id || '', user?.role);
  if (!user) return null;
  if (entry.needsPurpose) {
    return (
      <EntryPurposeScreen
        displayName={user.full_name}
        onWork={entry.chooseWork}
        onInspect={entry.chooseInspect}
      />
    );
  }
  return (
    <TelemarketingAgentScreen
      currentEmployee={{
        id: user.id,
        displayName: user.full_name,
        employeeCode: user.user_number,
      }}
      inspect={entry.inspect}
      inspectVariant={entry.isAdmin ? 'admin' : 'agent'}
      onSwitchToWork={entry.isAgent ? entry.switchToWork : undefined}
      onTurnOffAdminInspect={entry.isAdmin ? () => entry.setAdminInspectOn(false) : undefined}
    />
  );
}
