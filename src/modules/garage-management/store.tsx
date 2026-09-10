import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  DamagePart,
  GarageCase,
  GarageCustomer,
  GaragePhoto,
  GarageState,
  GarageVehicle,
  MailMessage,
  OpenDraft,
  PhotoTopic,
  QuotePartLine,
  QuoteWorkLine,
  SecureShare,
  VehicleIntake,
  WorkOrderVersion,
} from './types';
import { createInitialState, emptyDraft } from './seed';
import { nextCaseNumber, nowLabel, todayLabel, uid } from './logic';

const STORAGE_KEY = 'oren-car-garage-management-v1';

function loadState(): GarageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as GarageState;
    if (!parsed?.cases?.length) return createInitialState();
    return { ...createInitialState(), ...parsed, draft: parsed.draft || emptyDraft() };
  } catch {
    return createInitialState();
  }
}

function persist(state: GarageState) {
  try {
    const slim: GarageState = {
      ...state,
      cases: state.cases.map((c) => ({
        ...c,
        photos: c.photos.map((p) =>
          p.dataUrl && p.dataUrl.length > 80_000 ? { ...p, dataUrl: p.dataUrl.slice(0, 80) } : p,
        ),
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    /* quota — demo keeps working in memory */
  }
}

interface GarageStore extends GarageState {
  resetDraft: () => void;
  patchDraft: (patch: Partial<OpenDraft>) => void;
  addCustomer: (c: GarageCustomer) => void;
  addVehicle: (v: GarageVehicle) => void;
  openCase: (input?: { customer?: GarageCustomer; vehicle?: GarageVehicle }) => GarageCase;
  getCase: (id: string) => GarageCase | undefined;
  updateCase: (id: string, patch: Partial<GarageCase> | ((c: GarageCase) => GarageCase)) => void;
  addHistory: (id: string, text: string) => void;
  setAngle: (id: string, key: string, dataUrl: string, label: string) => void;
  setPart: (id: string, part: DamagePart) => void;
  upsertWork: (id: string, line: QuoteWorkLine) => void;
  removeWork: (id: string, lineId: string) => void;
  upsertPartLine: (id: string, line: QuotePartLine) => void;
  removePartLine: (id: string, lineId: string) => void;
  addPhoto: (id: string, photo: Omit<GaragePhoto, 'id' | 'createdAt'> & { id?: string }) => string;
  addOrder: (id: string, order: Omit<WorkOrderVersion, 'createdAt' | 'version'> & { version?: number }) => void;
  addMail: (id: string, mail: Omit<MailMessage, 'id' | 'at'> & { id?: string; at?: string }) => void;
  addShare: (id: string, share: Omit<SecureShare, 'id' | 'token' | 'createdAt' | 'revoked'>) => SecureShare;
  revokeShare: (id: string, shareId: string) => void;
  saveIntake: (id: string, intake: VehicleIntake) => void;
}

const GarageContext = createContext<GarageStore | null>(null);

export function GarageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GarageState>(() => loadState());

  const commit = useCallback((updater: (prev: GarageState) => GarageState) => {
    setState((prev) => {
      const next = updater(prev);
      persist(next);
      return next;
    });
  }, []);

  const resetDraft = useCallback(() => commit((s) => ({ ...s, draft: emptyDraft() })), [commit]);

  const patchDraft = useCallback(
    (patch: Partial<OpenDraft>) => commit((s) => ({ ...s, draft: { ...s.draft, ...patch } })),
    [commit],
  );

  const addCustomer = useCallback(
    (c: GarageCustomer) => commit((s) => ({ ...s, customers: [c, ...s.customers.filter((x) => x.id !== c.id)] })),
    [commit],
  );

  const addVehicle = useCallback(
    (v: GarageVehicle) => commit((s) => ({ ...s, vehicles: [v, ...s.vehicles.filter((x) => x.id !== v.id)] })),
    [commit],
  );

  const updateCase = useCallback(
    (id: string, patch: Partial<GarageCase> | ((c: GarageCase) => GarageCase)) => {
      commit((s) => ({
        ...s,
        cases: s.cases.map((c) => {
          if (c.id !== id && c.number !== id) return c;
          return typeof patch === 'function' ? patch(c) : { ...c, ...patch };
        }),
      }));
    },
    [commit],
  );

  const addHistory = useCallback(
    (id: string, text: string) => {
      updateCase(id, (c) => ({
        ...c,
        history: [{ id: uid('h'), at: nowLabel(), text }, ...c.history],
      }));
    },
    [updateCase],
  );

  const openCase = useCallback(
    (input?: { customer?: GarageCustomer; vehicle?: GarageVehicle }) => {
      const customer: GarageCustomer = input?.customer || {
        id: uid('c'),
        kind: state.draft.customerKind,
        name: state.draft.customer.name || 'לקוח חדש',
        phone: state.draft.customer.phone || '',
        email: state.draft.customer.email,
        companyName: state.draft.customer.companyName,
      };
      const vehicle: GarageVehicle = input?.vehicle || {
        id: uid('v'),
        plate: state.draft.vehicle.plate || '00-000-00',
        manufacturer: state.draft.vehicle.manufacturer || '',
        model: state.draft.vehicle.model || '',
        year: state.draft.vehicle.year,
        type: state.draft.vehicle.type,
        customerId: customer.id,
      };
      const number = nextCaseNumber(state.cases);
      const created: GarageCase = {
        id: `case-${number}`,
        number,
        status: 'open',
        customer,
        vehicle,
        worker: 'יוסי כהן',
        openedAt: new Date().toISOString().slice(0, 10),
        damageArea: state.draft.damageArea,
        damageDescription: state.draft.damageDescription,
        notes: state.draft.notes,
        angles: {},
        extraPhotos: {},
        parts: [],
        works: [],
        partsLines: [],
        quotePhotoIds: [],
        photos: [],
        orders: [],
        mails: [],
        history: [{ id: uid('h'), at: nowLabel(), text: `יוסי כהן פתח תיק #${number}` }],
        shares: [],
      };
      commit((s) => ({
        ...s,
        customers: s.customers.some((c) => c.id === customer.id) ? s.customers : [customer, ...s.customers],
        vehicles: s.vehicles.some((v) => v.id === vehicle.id) ? s.vehicles : [vehicle, ...s.vehicles],
        cases: [created, ...s.cases],
        draft: emptyDraft(),
      }));
      return created;
    },
    [commit, state.cases, state.draft],
  );

  const getCase = useCallback(
    (id: string) => state.cases.find((c) => c.id === id || c.number === id || c.id === `case-${id}`),
    [state.cases],
  );

  const setAngle = useCallback(
    (id: string, key: string, dataUrl: string, label: string) => {
      updateCase(id, (c) => ({
        ...c,
        status: c.status === 'open' ? 'inspecting' : c.status,
        angles: { ...c.angles, [key]: dataUrl },
        photos: [
          { id: uid('ph'), topic: 'four_angles', label, dataUrl, createdAt: nowLabel() },
          ...c.photos,
        ],
        history: [{ id: uid('h'), at: nowLabel(), text: `צולמה זווית: ${label}` }, ...c.history],
      }));
    },
    [updateCase],
  );

  const setPart = useCallback(
    (id: string, part: DamagePart) => {
      updateCase(id, (c) => {
        const rest = c.parts.filter((p) => p.id !== part.id);
        const text =
          part.state === 'ok' ? `${part.name} סומן כתקין` : `נזק סומן: ${part.name}`;
        return {
          ...c,
          parts: [part, ...rest],
          history: [{ id: uid('h'), at: nowLabel(), text }, ...c.history],
        };
      });
    },
    [updateCase],
  );

  const upsertWork = useCallback(
    (id: string, line: QuoteWorkLine) => {
      updateCase(id, (c) => {
        const exists = c.works.some((w) => w.id === line.id);
        return {
          ...c,
          status: c.status === 'inspecting' || c.status === 'open' ? 'quote_draft' : c.status,
          works: exists ? c.works.map((w) => (w.id === line.id ? line : w)) : [...c.works, line],
        };
      });
    },
    [updateCase],
  );

  const removeWork = useCallback(
    (id: string, lineId: string) => {
      updateCase(id, (c) => ({ ...c, works: c.works.filter((w) => w.id !== lineId) }));
    },
    [updateCase],
  );

  const upsertPartLine = useCallback(
    (id: string, line: QuotePartLine) => {
      updateCase(id, (c) => {
        const exists = c.partsLines.some((p) => p.id === line.id);
        return {
          ...c,
          partsLines: exists ? c.partsLines.map((p) => (p.id === line.id ? line : p)) : [...c.partsLines, line],
        };
      });
    },
    [updateCase],
  );

  const removePartLine = useCallback(
    (id: string, lineId: string) => {
      updateCase(id, (c) => ({ ...c, partsLines: c.partsLines.filter((p) => p.id !== lineId) }));
    },
    [updateCase],
  );

  const addPhoto = useCallback(
    (id: string, photo: Omit<GaragePhoto, 'id' | 'createdAt'> & { id?: string }) => {
      const photoId = photo.id || uid('ph');
      updateCase(id, (c) => ({
        ...c,
        photos: [
          { id: photoId, createdAt: nowLabel(), topic: photo.topic, label: photo.label, dataUrl: photo.dataUrl, selected: photo.selected },
          ...c.photos,
        ],
      }));
      return photoId;
    },
    [updateCase],
  );

  const addOrder = useCallback(
    (id: string, order: Omit<WorkOrderVersion, 'createdAt' | 'version'> & { version?: number }) => {
      updateCase(id, (c) => {
        const version = order.version || (c.orders[0]?.version || 0) + 1;
        return {
          ...c,
          status: c.status === 'awaiting_approval' || c.status === 'approved' ? 'approved' : c.status,
          orders: [{ ...order, version, createdAt: nowLabel() }, ...c.orders],
          history: [{ id: uid('h'), at: nowLabel(), text: `התקבלה הזמנה ${order.number} (V${version})` }, ...c.history],
        };
      });
    },
    [updateCase],
  );

  const addMail = useCallback(
    (id: string, mail: Omit<MailMessage, 'id' | 'at'> & { id?: string; at?: string }) => {
      updateCase(id, (c) => ({
        ...c,
        mails: [{ id: mail.id || uid('m'), at: mail.at || nowLabel(), from: mail.from, to: mail.to, cc: mail.cc, subject: mail.subject, body: mail.body, direction: mail.direction }, ...c.mails],
        history: [{ id: uid('h'), at: nowLabel(), text: `מייל ${mail.direction === 'out' ? 'נשלח' : 'התקבל'}: ${mail.subject}` }, ...c.history],
      }));
    },
    [updateCase],
  );

  const addShare = useCallback(
    (id: string, share: Omit<SecureShare, 'id' | 'token' | 'createdAt' | 'revoked'>) => {
      const created: SecureShare = {
        ...share,
        id: uid('sh'),
        token: `gm_${uid('t')}`,
        createdAt: nowLabel(),
        revoked: false,
      };
      updateCase(id, (c) => ({
        ...c,
        shares: [created, ...c.shares],
        history: [{ id: uid('h'), at: nowLabel(), text: 'נוצר קישור שיתוף מאובטח (פנימי)' }, ...c.history],
      }));
      return created;
    },
    [updateCase],
  );

  const revokeShare = useCallback(
    (id: string, shareId: string) => {
      updateCase(id, (c) => ({
        ...c,
        shares: c.shares.map((s) => (s.id === shareId ? { ...s, revoked: true } : s)),
      }));
    },
    [updateCase],
  );

  const saveIntake = useCallback(
    (id: string, intake: VehicleIntake) => {
      updateCase(id, (c) => ({
        ...c,
        intake,
        status: 'in_work',
        history: [{ id: uid('h'), at: nowLabel(), text: 'הרכב התקבל לעבודה' }, ...c.history],
      }));
    },
    [updateCase],
  );

  const value = useMemo<GarageStore>(
    () => ({
      ...state,
      resetDraft,
      patchDraft,
      addCustomer,
      addVehicle,
      openCase,
      getCase,
      updateCase,
      addHistory,
      setAngle,
      setPart,
      upsertWork,
      removeWork,
      upsertPartLine,
      removePartLine,
      addPhoto,
      addOrder,
      addMail,
      addShare,
      revokeShare,
      saveIntake,
    }),
    [
      state,
      resetDraft,
      patchDraft,
      addCustomer,
      addVehicle,
      openCase,
      getCase,
      updateCase,
      addHistory,
      setAngle,
      setPart,
      upsertWork,
      removeWork,
      upsertPartLine,
      removePartLine,
      addPhoto,
      addOrder,
      addMail,
      addShare,
      revokeShare,
      saveIntake,
    ],
  );

  return <GarageContext.Provider value={value}>{children}</GarageContext.Provider>;
}

export function useGarage() {
  const ctx = useContext(GarageContext);
  if (!ctx) throw new Error('useGarage must be used inside GarageProvider');
  return ctx;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function mockBackendToast() {
  return {
    title: 'מוכן ב-UI — ממתין ל-Backend',
    description: 'הפעולה נשמרת בדמו המקומי. חיבור PDF / מייל / שיתוף אמיתי יתווסף באישור נפרד.',
  };
}

export { todayLabel };
