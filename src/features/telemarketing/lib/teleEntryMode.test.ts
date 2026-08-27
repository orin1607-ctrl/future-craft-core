import { describe, expect, it, beforeEach } from 'vitest';
import {
  businessActionsBlocked,
  clearAllTeleModes,
  clearTeleModesForUser,
  employeeFirstName,
  getAdminInspect,
  getAgentEntryMode,
  isAgentInspect,
  needsPurposeChoice,
  setAdminInspect,
  setAgentEntryMode,
} from './teleEntryMode';

const USER = 'user-tair';
const OTHER = 'user-other';

describe('teleEntryMode', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('asks for purpose when this tab has no chosen mode', () => {
    expect(needsPurposeChoice(USER)).toBe(true);
    expect(getAgentEntryMode(USER)).toBeNull();
  });

  it('keeps work mode across a simulated refresh in the same tab', () => {
    setAgentEntryMode(USER, 'work');
    expect(needsPurposeChoice(USER)).toBe(false);
    expect(getAgentEntryMode(USER)).toBe('work');
    expect(isAgentInspect(USER)).toBe(false);
    expect(businessActionsBlocked('work')).toBe(false);
  });

  it('blocks business actions only in inspect', () => {
    setAgentEntryMode(USER, 'inspect');
    expect(isAgentInspect(USER)).toBe(true);
    expect(businessActionsBlocked('inspect')).toBe(true);
    expect(businessActionsBlocked('work')).toBe(false);
    expect(businessActionsBlocked(null)).toBe(false);
  });

  it('switch inspect → work unlocks without converting previous time', () => {
    setAgentEntryMode(USER, 'inspect');
    setAgentEntryMode(USER, 'work');
    expect(getAgentEntryMode(USER)).toBe('work');
    expect(businessActionsBlocked('work')).toBe(false);
  });

  it('scopes mode per user id', () => {
    setAgentEntryMode(USER, 'inspect');
    expect(needsPurposeChoice(OTHER)).toBe(true);
    expect(getAgentEntryMode(OTHER)).toBeNull();
  });

  it('clears on login/logout for that user', () => {
    setAgentEntryMode(USER, 'work');
    setAdminInspect(USER, true);
    setAgentEntryMode(OTHER, 'inspect');
    clearTeleModesForUser(USER);
    expect(needsPurposeChoice(USER)).toBe(true);
    expect(getAdminInspect(USER)).toBe(false);
    expect(getAgentEntryMode(OTHER)).toBe('inspect');
  });

  it('admin inspect is opt-in and blocks mutations', () => {
    expect(getAdminInspect(USER)).toBe(false);
    setAdminInspect(USER, true);
    expect(getAdminInspect(USER)).toBe(true);
    expect(businessActionsBlocked(null, true)).toBe(true);
    setAdminInspect(USER, false);
    expect(getAdminInspect(USER)).toBe(false);
  });

  it('clearAll removes both agent and admin keys', () => {
    setAgentEntryMode(USER, 'inspect');
    setAdminInspect(OTHER, true);
    clearAllTeleModes();
    expect(getAgentEntryMode(USER)).toBeNull();
    expect(getAdminInspect(OTHER)).toBe(false);
  });
});

describe('employeeFirstName', () => {
  it('uses the first token of the existing display name', () => {
    expect(employeeFirstName('תאיר')).toBe('תאיר');
    expect(employeeFirstName('תאיר מזרחי')).toBe('תאיר');
    expect(employeeFirstName('  אבי כהן  ')).toBe('אבי');
  });

  it('does not hardcode Tair', () => {
    expect(employeeFirstName('נועה')).toBe('נועה');
    expect(employeeFirstName('')).toBe('');
    expect(employeeFirstName(null)).toBe('');
  });
});
