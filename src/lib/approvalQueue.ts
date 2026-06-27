import { supabase } from '@/integrations/supabase/client';

export type ApprovalEntityType = 'vehicle' | 'service_order' | 'driver' | 'document';

export async function createApprovalRequest(params: {
  companyName: string;
  entityType: ApprovalEntityType;
  entityId: string;
  actionType: string;
  vehiclePlate?: string;
  description?: string;
  requestedBy?: string;
  requestedByName?: string;
}): Promise<void> {
  const { error } = await supabase.from('approval_requests').insert({
    company_name: params.companyName,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action_type: params.actionType,
    vehicle_plate: params.vehiclePlate || '',
    description: params.description || '',
    requested_by: params.requestedBy || null,
    requested_by_name: params.requestedByName || '',
    status: 'pending',
  });
  if (error) {
    console.error('[approvalQueue] insert failed', error);
    throw new Error(error.message || 'שגיאה ביצירת בקשת אישור');
  }
}
