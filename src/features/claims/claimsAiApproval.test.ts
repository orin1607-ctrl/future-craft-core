import { describe, expect, it } from 'vitest';
import { isApprovalText, isCancelText } from './claimsAiApproval';

describe('claimsAiApproval', () => {
  it('accepts explicit short approvals', () => {
    for (const t of ['מאשר', ' מאשר! ', 'שלח', 'כן, שלח', 'אישור', 'Yes', 'אני מאשרת.', 'מאשר לשלוח את הכול', 'שלח את כולם', 'מאשר את כולם', 'שלח הכל']) {
      expect(isApprovalText(t), t).toBe(true);
    }
  });
  it('does not treat sentences or questions as approval', () => {
    for (const t of ['מאשר רק אחרי שתשני את הנושא', 'שלח לגדי במקום', 'האם לשלוח?', 'תכין מייל', 'לא']) {
      expect(isApprovalText(t), t).toBe(false);
    }
  });
  it('detects cancel', () => {
    expect(isCancelText('בטל')).toBe(true);
    expect(isCancelText('אל תשלח')).toBe(true);
    expect(isCancelText('מאשר')).toBe(false);
  });
});
