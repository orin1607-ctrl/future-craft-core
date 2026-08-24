import { useAuth } from '@/contexts/AuthContext';
import { TelemarketingAdminScreen } from '@/features/telemarketing/pages/TelemarketingAdminScreen';

export default function TelemarketingAdminPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <TelemarketingAdminScreen currentManagerId={user.id} />;
}
