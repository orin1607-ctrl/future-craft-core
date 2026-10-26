import { describe, expect, it } from 'vitest';
import {
  TRI_FORM_DOWNLOAD_LABEL,
  assembleTriInspectionForm,
  canDownloadTriForm,
  triFormFileName,
} from '@/lib/triInspectionFormModel';

const signature = `data:image/png;base64,${'A'.repeat(80)}`;

describe('tri inspection form download model', () => {
  it('offers the download only for the tri/semi form', () => {
    expect(canDownloadTriForm('tri_semi_annual')).toBe(true);
    expect(canDownloadTriForm('semi_annual')).toBe(false);
    expect(canDownloadTriForm('quarterly')).toBe(false);
    expect(TRI_FORM_DOWNLOAD_LABEL).toBe('הורד טופס למחשב');
  });

  it('keeps the open-form fields, stamp and signature', () => {
    const form = assembleTriInspectionForm({
      plate: '12-345-67',
      internalNumber: 'OC-17',
      year: 2019,
      inspectionDate: '2026-08-14',
      nextDueDate: '2026-11-14',
      inspectorName: 'קצין בדיקה',
      overallStatus: 'passed',
      notes: 'קילומטראז׳: 120000\nהערה כללית לטופס',
      signatureSrc: signature,
      items: [
        { item_name: 'צמיגים', status: 'ok', notes: '' },
        { item_name: 'בלמים', status: 'defect', notes: 'רעש בצד ימין' },
      ],
      tasks: [{ title: 'החלפת רפידות', description: 'רעש בצד ימין', status: 'open' }],
    });

    expect(form.stamp).toBe('תקין');
    expect(form.title).toBe('ביקורת רכב 12-345-67');
    expect(form.signatureSrc).toBe(signature);
    expect(form.fields.map((field) => field.label)).toEqual([
      'מספר רכב',
      'מספר פנימי',
      'שנת הרכב',
      'תאריך הביקורת',
      'מועד בדיקה הבאה',
      'בודק',
      'סוג הביקורת',
      'קילומטראז׳ בבדיקה',
    ]);
    expect(form.fields.find((field) => field.label === 'סוג הביקורת')?.value).toBe('תלת/חצי שנתית');
    expect(form.fields.find((field) => field.label === 'קילומטראז׳ בבדיקה')?.value).toBe('120000');
    expect(form.items.map((item) => item.label)).toEqual(['צמיגים', 'בלמים']);
    expect(form.itemResult).toEqual(['תקין', 'ליקוי']);
    expect(form.defects[0]?.text).toBe('רעש בצד ימין');
    expect(form.notes.some((note) => note.text === 'הערה כללית לטופס')).toBe(true);
    expect(form.fileName.endsWith('.pdf')).toBe(true);
    expect(form.fileName.includes('/')).toBe(false);
  });

  it('leaves the signature off when the inspection has none', () => {
    const form = assembleTriInspectionForm({
      plate: '99-000-11',
      inspectionDate: '2026-01-02',
      overallStatus: 'failed',
      notes: '',
      items: [],
    });
    expect(form.signatureSrc).toBe('');
    expect(form.stamp).toBe('ליקויים');
    expect(form.notes).toEqual([]);
    expect(triFormFileName('a/b', '2026-01-02').includes('/')).toBe(false);
  });
});
