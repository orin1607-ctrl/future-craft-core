import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRequiredFieldsOverrides, patchRequiredField } from '@/lib/requiredFieldsApi';
import {
  mergeRequiredFields,
  type RequiredFieldModule,
  type RequiredFieldsOverrides,
} from '@/lib/requiredFieldsSchema';
import { validateRequiredModuleFields } from '@/lib/requiredFieldsValidate';

type RequiredFieldsContextValue = {
  loading: boolean;
  overrides: RequiredFieldsOverrides;
  effective: RequiredFieldsOverrides;
  isFieldRequired: (module: RequiredFieldModule, fieldKey: string) => boolean;
  setFieldRequired: (module: RequiredFieldModule, fieldKey: string, required: boolean) => Promise<void>;
  validateModule: (
    module: RequiredFieldModule,
    values: Record<string, string>,
  ) => { ok: true } | { ok: false; message: string; fieldKey?: string };
  refresh: () => Promise<void>;
};

const RequiredFieldsContext = createContext<RequiredFieldsContextValue | null>(null);

export function RequiredFieldsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState<RequiredFieldsOverrides>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRequiredFieldsOverrides();
      setOverrides(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setOverrides({});
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh, user?.id]);

  const effective = useMemo(() => mergeRequiredFields(overrides), [overrides]);

  const isFieldRequiredFn = useCallback(
    (module: RequiredFieldModule, fieldKey: string) => {
      const id = `${module}.${fieldKey}`;
      if (id in effective) return effective[id];
      return false;
    },
    [effective],
  );

  const setFieldRequired = useCallback(
    async (module: RequiredFieldModule, fieldKey: string, required: boolean) => {
      const next = await patchRequiredField(module, fieldKey, required, overrides, user?.id);
      setOverrides(next);
    },
    [overrides, user?.id],
  );

  const validateModule = useCallback(
    (module: RequiredFieldModule, values: Record<string, string>) =>
      validateRequiredModuleFields(module, values, overrides),
    [overrides],
  );

  const value = useMemo(
    () => ({
      loading,
      overrides,
      effective,
      isFieldRequired: isFieldRequiredFn,
      setFieldRequired,
      validateModule,
      refresh,
    }),
    [loading, overrides, effective, isFieldRequiredFn, setFieldRequired, validateModule, refresh],
  );

  return <RequiredFieldsContext.Provider value={value}>{children}</RequiredFieldsContext.Provider>;
}

export function useRequiredFields(): RequiredFieldsContextValue {
  const ctx = useContext(RequiredFieldsContext);
  if (!ctx) {
    throw new Error('useRequiredFields must be used within RequiredFieldsProvider');
  }
  return ctx;
}

/** Safe for forms that may render outside the provider (dev previews). */
export function useRequiredFieldsOptional(): RequiredFieldsContextValue | null {
  return useContext(RequiredFieldsContext);
}
