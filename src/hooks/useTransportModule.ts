import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCompanySettings } from '@/lib/companySettings';
import {
  isTransportFeatureVisible,
  type TransportFeatureId,
} from '@/lib/transportSettings';

export function useTransportModule() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [hiddenFeatures, setHiddenFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = user?.role === 'super_admin';
  const companyName = user?.company_name || '';

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setLoading(false);
      return;
    }

    if (isSuperAdmin) {
      setEnabled(true);
      setHiddenFeatures([]);
      setLoading(false);
      return;
    }

    if (!companyName) {
      setEnabled(false);
      setHiddenFeatures([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchCompanySettings(companyName).then((row) => {
      if (cancelled) return;
      setEnabled(Boolean(row?.module_transport_enabled));
      setHiddenFeatures(row?.transport_hidden_features || []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, companyName, isSuperAdmin]);

  const isFeatureVisible = (featureId: TransportFeatureId) =>
    isTransportFeatureVisible(enabled, hiddenFeatures, featureId, isSuperAdmin);

  return {
    enabled: isSuperAdmin || enabled,
    hiddenFeatures,
    loading,
    isFeatureVisible,
    isSuperAdmin,
  };
}
