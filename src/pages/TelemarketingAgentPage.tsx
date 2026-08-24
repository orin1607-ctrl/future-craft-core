import { useAuth } from '@/contexts/AuthContext';
import { TelemarketingAgentScreen } from '@/features/telemarketing/pages/TelemarketingAgentScreen';

export default function TelemarketingAgentPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <TelemarketingAgentScreen
      currentEmployee={{
        id: user.id,
        displayName: user.full_name,
        employeeCode: user.user_number,
      }}
    />
  );
}
