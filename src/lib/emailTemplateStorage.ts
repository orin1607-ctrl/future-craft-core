const STORAGE_KEY = 'dalia_email_templates_v1';

export type StoredEmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  variables: string[];
  updatedAt?: string;
};

export function loadStoredEmailTemplates(
  defaults: StoredEmailTemplate[],
): StoredEmailTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, StoredEmailTemplate>;
    return defaults.map((d) => parsed[d.id] ?? d);
  } catch {
    return defaults;
  }
}

export function saveStoredEmailTemplate(template: StoredEmailTemplate): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, StoredEmailTemplate>) : {};
    parsed[template.id] = { ...template, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (err) {
    console.error('saveStoredEmailTemplate', err);
    throw err;
  }
}

export function resetStoredEmailTemplate(id: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, StoredEmailTemplate>;
    delete parsed[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (err) {
    console.error('resetStoredEmailTemplate', err);
  }
}
