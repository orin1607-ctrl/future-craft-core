import { describe, expect, it } from 'vitest';
import {
  gapsAttentionLabel,
  gapsAttentionWarn,
  insuranceAttentionLabel,
  insuranceAttentionWarn,
} from './companyAttentionRedSettings';

describe('company attention display (visibility + red)', () => {
  const base = {
    showInsuranceAttention: true,
    showInsuranceAttentionRed: true,
    showGapsAttention: true,
    showGapsAttentionRed: true,
  };

  it('insurance: show ON + red ON', () => {
    expect(insuranceAttentionLabel(true, base)).toBe('יש לטפל');
    expect(insuranceAttentionWarn(true, base)).toBe(true);
  });

  it('insurance: show ON + red OFF', () => {
    const s = { ...base, showInsuranceAttentionRed: false };
    expect(insuranceAttentionLabel(true, s)).toBe('יש לטפל');
    expect(insuranceAttentionWarn(true, s)).toBe(false);
  });

  it('insurance: show OFF + red ON → hidden, no red', () => {
    const s = { ...base, showInsuranceAttention: false, showInsuranceAttentionRed: true };
    expect(insuranceAttentionLabel(true, s)).toBe('בסדר');
    expect(insuranceAttentionWarn(true, s)).toBe(false);
  });

  it('insurance: show OFF + red OFF → hidden, no red', () => {
    const s = { ...base, showInsuranceAttention: false, showInsuranceAttentionRed: false };
    expect(insuranceAttentionLabel(true, s)).toBe('בסדר');
    expect(insuranceAttentionWarn(true, s)).toBe(false);
  });

  it('gaps: show ON + red ON', () => {
    expect(gapsAttentionLabel(true, base)).toBe('דורש טיפול');
    expect(gapsAttentionWarn(true, base)).toBe(true);
  });

  it('gaps: show ON + red OFF', () => {
    const s = { ...base, showGapsAttentionRed: false };
    expect(gapsAttentionLabel(true, s)).toBe('דורש טיפול');
    expect(gapsAttentionWarn(true, s)).toBe(false);
  });

  it('gaps: show OFF + red ON → hidden, no red', () => {
    const s = { ...base, showGapsAttention: false, showGapsAttentionRed: true };
    expect(gapsAttentionLabel(true, s)).toBe('אין');
    expect(gapsAttentionWarn(true, s)).toBe(false);
  });

  it('gaps: show OFF + red OFF → hidden, no red', () => {
    const s = { ...base, showGapsAttention: false, showGapsAttentionRed: false };
    expect(gapsAttentionLabel(true, s)).toBe('אין');
    expect(gapsAttentionWarn(true, s)).toBe(false);
  });

  it('when no underlying attention, labels stay neutral even if show ON', () => {
    expect(insuranceAttentionLabel(false, base)).toBe('בסדר');
    expect(gapsAttentionLabel(false, base)).toBe('אין');
    expect(insuranceAttentionWarn(false, base)).toBe(false);
    expect(gapsAttentionWarn(false, base)).toBe(false);
  });
});
