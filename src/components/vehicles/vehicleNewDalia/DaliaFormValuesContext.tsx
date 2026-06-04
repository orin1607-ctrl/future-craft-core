import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type DaliaFormValuesContextValue = {
  values: Record<string, string>;
  getValue: (name: string) => string;
  setValue: (name: string, value: string) => void;
  /** ממזג ערכים — רק מפתחות עם ערך לא ריק */
  setValues: (patch: Record<string, string>) => void;
};

const DaliaFormValuesContext = createContext<DaliaFormValuesContextValue | null>(null);

export function DaliaFormValuesProvider({
  children,
  initialValues = {},
}: {
  children: ReactNode;
  initialValues?: Record<string, string>;
}) {
  const [values, setValuesState] = useState<Record<string, string>>(initialValues);

  const setValue = useCallback((name: string, value: string) => {
    setValuesState((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setValues = useCallback((patch: Record<string, string>) => {
    setValuesState((prev) => {
      const next = { ...prev };
      for (const [key, val] of Object.entries(patch)) {
        if (val !== undefined && val !== '') next[key] = val;
      }
      return next;
    });
  }, []);

  const getValue = useCallback((name: string) => values[name] ?? '', [values]);

  const ctx = useMemo(
    () => ({ values, getValue, setValue, setValues }),
    [values, getValue, setValue, setValues],
  );

  return <DaliaFormValuesContext.Provider value={ctx}>{children}</DaliaFormValuesContext.Provider>;
}

export function useDaliaFormValues(): DaliaFormValuesContextValue | null {
  return useContext(DaliaFormValuesContext);
}

export function useDaliaFormValuesRequired(): DaliaFormValuesContextValue {
  const ctx = useContext(DaliaFormValuesContext);
  if (!ctx) throw new Error('DaliaFormValuesProvider is required');
  return ctx;
}
