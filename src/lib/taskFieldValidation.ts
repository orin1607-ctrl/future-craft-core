import { fetchRequiredFieldsOverrides } from '@/lib/requiredFieldsApi';
import { validateRequiredModuleFields } from '@/lib/requiredFieldsValidate';

export async function validateTaskFields(values: Record<string, string>) {
  const overrides = await fetchRequiredFieldsOverrides();
  return validateRequiredModuleFields('tasks', values, overrides);
}
