import { fetchRequiredFieldsOverrides } from '@/lib/requiredFieldsApi';
import { validateRequiredModuleFields } from '@/lib/requiredFieldsValidate';

export async function validateTaskFields(
  values: Record<string, string>,
  companyName?: string | null,
) {
  const overrides = await fetchRequiredFieldsOverrides(companyName);
  return validateRequiredModuleFields('tasks', values, overrides);
}
