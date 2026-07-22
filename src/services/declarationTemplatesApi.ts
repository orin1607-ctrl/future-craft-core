import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_DECLARATION_BODY,
  DEFAULT_DECLARATION_TEMPLATE_NAME,
  DEFAULT_PLACEHOLDERS_JSON,
  normalizeTemplateCompanyName,
  type DeclarationTemplate,
} from '@/utils/declarationTemplates';

export { normalizeTemplateCompanyName };

function mapRow(row: Record<string, unknown>): DeclarationTemplate {
  return {
    id: String(row.id),
    company_name: String(row.company_name ?? ''),
    name: String(row.name ?? ''),
    body: String(row.body ?? ''),
    is_default: Boolean(row.is_default),
    placeholders: row.placeholders ?? [],
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export async function listDeclarationTemplates(companyName: string): Promise<DeclarationTemplate[]> {
  const company = normalizeTemplateCompanyName(companyName);
  if (!company) return [];
  const { data, error } = await supabase
    .from('declaration_templates')
    .select('*')
    .eq('company_name', company)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function getDeclarationTemplateById(id: string): Promise<DeclarationTemplate> {
  const { data, error } = await supabase
    .from('declaration_templates')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

/**
 * Ensure the company has at least one default template.
 * Seeds the built-in body ONLY when the company has zero templates.
 * Never overwrites an existing default body.
 */
export async function ensureDefaultDeclarationTemplate(
  companyName: string,
  createdBy?: string | null,
): Promise<DeclarationTemplate> {
  const company = normalizeTemplateCompanyName(companyName);
  if (!company) {
    throw new Error('חסר שם חברה ליצירת תבנית תצהיר');
  }

  const existing = await listDeclarationTemplates(company);
  const currentDefault = existing.find((t) => t.is_default) || existing[0];
  if (currentDefault) {
    if (!currentDefault.is_default) {
      // Promote existing row — do not re-seed hardcoded body
      return setDefaultDeclarationTemplate(currentDefault.id, company);
    }
    // Re-read by id so callers always get the latest persisted body from DB
    return getDeclarationTemplateById(currentDefault.id);
  }

  const { data, error } = await supabase
    .from('declaration_templates')
    .insert({
      company_name: company,
      name: DEFAULT_DECLARATION_TEMPLATE_NAME,
      body: DEFAULT_DECLARATION_BODY,
      is_default: true,
      placeholders: DEFAULT_PLACEHOLDERS_JSON,
      created_by: createdBy || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function createDeclarationTemplate(input: {
  companyName: string;
  name: string;
  body: string;
  isDefault?: boolean;
  createdBy?: string | null;
}): Promise<DeclarationTemplate> {
  const company = normalizeTemplateCompanyName(input.companyName);
  if (!company) throw new Error('חסר שם חברה ליצירת תבנית תצהיר');

  const { data, error } = await supabase
    .from('declaration_templates')
    .insert({
      company_name: company,
      name: input.name.trim(),
      body: input.body,
      is_default: Boolean(input.isDefault),
      placeholders: DEFAULT_PLACEHOLDERS_JSON,
      created_by: input.createdBy || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function updateDeclarationTemplate(
  id: string,
  patch: Partial<Pick<DeclarationTemplate, 'name' | 'body' | 'is_default'>>,
): Promise<DeclarationTemplate> {
  const payload: {
    name?: string;
    body?: string;
    is_default?: boolean;
  } = {};
  if (patch.name != null) payload.name = patch.name.trim();
  if (patch.body != null) payload.body = patch.body;
  if (patch.is_default != null) payload.is_default = patch.is_default;

  const { data, error } = await supabase
    .from('declaration_templates')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  // Always re-read after write so UI cannot keep a stale/local-only body
  return getDeclarationTemplateById(id);
}

export async function deleteDeclarationTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('declaration_templates')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function setDefaultDeclarationTemplate(
  id: string,
  _companyName: string,
): Promise<DeclarationTemplate> {
  return updateDeclarationTemplate(id, { is_default: true });
}

/**
 * Persist template body to DB and make it the company default.
 * New declarations always read this default from the database.
 */
export async function saveDeclarationTemplateBodyAsDefault(
  id: string,
  body: string,
  companyName: string,
): Promise<DeclarationTemplate> {
  const company = normalizeTemplateCompanyName(companyName);
  if (!company) throw new Error('חסר שם חברה לשמירת תבנית תצהיר');
  if (!String(body || '').trim()) throw new Error('נוסח התצהיר לא יכול להיות ריק');

  const { error } = await supabase
    .from('declaration_templates')
    .update({ body, is_default: true })
    .eq('id', id);

  if (error) throw error;

  // Final DB read — source of truth after save (not local/draft state)
  const confirmed = await getDeclarationTemplateById(id);
  if (confirmed.body !== body) {
    throw new Error('השמירה לא נשמרה במסד הנתונים — נסו שוב');
  }
  if (!confirmed.is_default) {
    throw new Error('התבנית נשמרה אך לא הוגדרה כברירת מחדל — נסו שוב');
  }
  return confirmed;
}

/** Latest default template body from DB (seed only if company has no templates yet). */
export async function getDefaultDeclarationTemplate(
  companyName: string,
  createdBy?: string | null,
): Promise<DeclarationTemplate> {
  return ensureDefaultDeclarationTemplate(companyName, createdBy);
}
