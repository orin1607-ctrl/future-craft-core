import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_DECLARATION_BODY,
  DEFAULT_DECLARATION_TEMPLATE_NAME,
  DEFAULT_PLACEHOLDERS_JSON,
  type DeclarationTemplate,
} from '@/utils/declarationTemplates';


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
  if (!companyName) return [];
  const { data, error } = await supabase
    .from('declaration_templates')
    .select('*')
    .eq('company_name', companyName)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

/** Ensure the company has at least one default template; create the built-in default if missing. */
export async function ensureDefaultDeclarationTemplate(
  companyName: string,
  createdBy?: string | null,
): Promise<DeclarationTemplate> {
  if (!companyName) {
    throw new Error('חסר שם חברה ליצירת תבנית תצהיר');
  }

  const existing = await listDeclarationTemplates(companyName);
  const currentDefault = existing.find((t) => t.is_default) || existing[0];
  if (currentDefault) {
    if (!currentDefault.is_default) {
      await setDefaultDeclarationTemplate(currentDefault.id, companyName);
      return { ...currentDefault, is_default: true };
    }
    return currentDefault;
  }

  const { data, error } = await supabase
    .from('declaration_templates')
    .insert({
      company_name: companyName,
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
  const { data, error } = await supabase
    .from('declaration_templates')
    .insert({
      company_name: input.companyName,
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
  return mapRow(data as Record<string, unknown>);
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

export async function getDefaultDeclarationTemplate(
  companyName: string,
  createdBy?: string | null,
): Promise<DeclarationTemplate> {
  return ensureDefaultDeclarationTemplate(companyName, createdBy);
}
