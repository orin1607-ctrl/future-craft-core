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
import { fetchRequiredFieldsStore, patchRequiredField } from '@/lib/requiredFieldsApi';
import {
  emptyRequiredFieldsStore,
  isFieldRequiredForCompany,
  resolveCompanyOverrides,
  type RequiredFieldsStore,
} from '@/lib/requiredFieldsCompany';
import {
  mergeRequiredFields,
  type RequiredFieldModule,
  type RequiredFieldsOverrides,
} from '@/lib/requiredFieldsSchema';
import { validateRequiredModuleFields } from '@/lib/requiredFieldsValidate';

type RequiredFieldsContextValue = {
  loading: boolean;
  store: RequiredFieldsStore;
  /** @deprecated Prefer getOverridesForCompany / isFieldRequired with company */
  overrides: RequiredFieldsOverrides;
  /** @deprecated Prefer company-aware helpers */
  effective: RequiredFieldsOverrides;
  getOverridesForCompany: (companyName?: string | null) => RequiredFieldsOverrides;
  isFieldRequired: (
    module: RequiredFieldModule,
    fieldKey: string,
    companyName?: string | null,
  ) => boolean;
  setFieldRequired: (
    module: RequiredFieldModule,
    fieldKey: string,
    required: boolean,
    companyName: string,
  ) => Promise<void>;
  validateModule: (
    module: RequiredFieldModule,
    values: Record<string, string>,
    companyName?: string | null,
  ) => { ok: true } | { ok: false; message: string; fieldKey?: string };
  refresh: () => Promise<void>;
};

const RequiredFieldsContext = createContext<RequiredFieldsContextValue | null>(null);

export function RequiredFieldsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [store, setStore] = useState<RequiredFieldsStore>(emptyRequiredFieldsStore);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRequiredFieldsStore();
      setStore(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setStore(emptyRequiredFieldsStore());
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh, user?.id]);

  const defaultCompany = user?.company_name ?? null;

  const getOverridesForCompany = useCallback(
    (companyName?: string | null) =>
      resolveCompanyOverrides(store, companyName ?? defaultCompany),
    [store, defaultCompany],
  );

  const overrides = useMemo(
    () => resolveCompanyOverrides(store, defaultCompany),
    [store, defaultCompany],
  );
  const effective = useMemo(() => mergeRequiredFields(overrides), [overrides]);

  const isFieldRequiredFn = useCallback(
    (module: RequiredFieldModule, fieldKey: string, companyName?: string | null) =>
      isFieldRequiredForCompany(module, fieldKey, store, companyName ?? defaultCompany),
    [store, defaultCompany],
  );

  const setFieldRequired = useCallback(
    async (
      module: RequiredFieldModule,
      fieldKey: string,
      required: boolean,
      companyName: string,
    ) => {
      const next = await patchRequiredField(companyName, module, fieldKey, required, user?.id);
      setStore(next);
    },
    [user?.id],
  );

  const validateModule = useCallback(
    (module: RequiredFieldModule, values: Record<string, string>, companyName?: string | null) =>
      validateRequiredModuleFields(
        module,
        values,
        resolveCompanyOverrides(store, companyName ?? defaultCompany),
      ),
    [store, defaultCompany],
  );

  const value = useMemo(
    () => ({
      loading,
      store,
      overrides,
      effective,
      getOverridesForCompany,
      isFieldRequired: isFieldRequiredFn,
      setFieldRequired,
      validateModule,
      refresh,
    }),
    [
      loading,
      store,
      overrides,
      effective,
      getOverridesForCompany,
      isFieldRequiredFn,
      setFieldRequired,
      validateModule,
      refresh,
    ],
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
