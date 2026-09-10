import { useCallback, useEffect, useState } from 'react';
import { recordTeleEntryAudit } from '@/features/telemarketing/lib/teleEntryAudit';
import {
  TELE_AUDIT_ACTION,
  getAdminInspect,
  getAgentEntryMode,
  setAdminInspect,
  setAgentEntryMode,
  type TeleEntryMode,
} from '@/features/telemarketing/lib/teleEntryMode';

export function useTeleEntryMode(userId: string, role: string | undefined) {
  const isAgent = role === 'telemarketing_agent';
  const isAdmin = role === 'super_admin';
  const [agentMode, setAgentMode] = useState<TeleEntryMode | null>(() => (userId && isAgent ? getAgentEntryMode(userId) : null));
  const [adminInspect, setAdminInspectState] = useState(() => (userId && isAdmin ? getAdminInspect(userId) : false));

  useEffect(() => {
    if (!userId) return;
    if (isAgent) setAgentMode(getAgentEntryMode(userId));
    if (isAdmin) setAdminInspectState(getAdminInspect(userId));
  }, [userId, isAgent, isAdmin]);

  const chooseWork = useCallback(() => {
    setAgentEntryMode(userId, 'work');
    setAgentMode('work');
    void recordTeleEntryAudit(TELE_AUDIT_ACTION.choseWork, { mode: 'work', role });
  }, [userId, role]);

  const chooseInspect = useCallback(() => {
    setAgentEntryMode(userId, 'inspect');
    setAgentMode('inspect');
    void recordTeleEntryAudit(TELE_AUDIT_ACTION.choseInspect, { mode: 'inspect', role });
  }, [userId, role]);

  const switchToWork = useCallback(() => {
    setAgentEntryMode(userId, 'work');
    setAgentMode('work');
    void recordTeleEntryAudit(TELE_AUDIT_ACTION.switchToWork, { from: 'inspect', to: 'work', role });
  }, [userId, role]);

  const setAdminInspectOn = useCallback((on: boolean) => {
    setAdminInspect(userId, on);
    setAdminInspectState(on);
    void recordTeleEntryAudit(on ? TELE_AUDIT_ACTION.adminOn : TELE_AUDIT_ACTION.adminOff, { adminInspect: on, role });
  }, [userId, role]);

  return {
    isAgent,
    isAdmin,
    agentMode,
    needsPurpose: isAgent && agentMode === null,
    inspect: isAgent ? agentMode === 'inspect' : adminInspect,
    adminInspect,
    chooseWork,
    chooseInspect,
    switchToWork,
    setAdminInspectOn,
  };
}
