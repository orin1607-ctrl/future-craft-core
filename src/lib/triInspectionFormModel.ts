/**
 * Text of the existing tri/semi inspection card.
 * The PDF is built from this model so the download keeps the same fields,
 * status stamp and signature that the open inspection already shows.
 */
import { formatInspectionDateHe, parseInspectionNotes } from '@/lib/triInspectionDisplay';

const EMBEDDED_SIGNATURE = /data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\r\n]+/gi;

function stripEmbeddedSignature(notes: string | null | undefined): string {
  return String(notes || '')
    .replace(EMBEDDED_SIGNATURE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const TRI_FORM_DOWNLOAD_LABEL = 'הורד טופס למחשב';
export const TRI_SEMI_FORM_TYPE = 'tri_semi_annual';

export function canDownloadTriForm(type: string | null | undefined): boolean {
  return type === TRI_SEMI_FORM_TYPE;
}

export interface TriFormItem {
  item_name: string;
  status: string;
  notes: string;
}

export interface TriFormTask {
  title: string;
  description: string;
  status: string;
}

export interface TriFormSource {
  plate: string;
  internalNumber?: string | null;
  year?: string | number | null;
  inspectionDate: string;
  nextDueDate?: string | null;
  inspectorName?: string | null;
  overallStatus?: string | null;
  notes?: string | null;
  signatureSrc?: string | null;
  items?: TriFormItem[];
  tasks?: TriFormTask[];
}

export interface TriFormField {
  label: string;
  value: string;
}

export interface TriFormNote {
  label: string;
  text: string;
}

export interface TriInspectionFormModel {
  title: string;
  stamp: string;
  passed: boolean;
  fileName: string;
  fields: TriFormField[];
  signatureSrc: string;
  inspectorName: string;
  notes: TriFormNote[];
  defects: TriFormNote[];
  items: TriFormNote[];
  itemResult: string[];
  tasks: TriFormNote[];
}

function dash(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim();
  return text || '—';
}

function itemResult(status: string): string {
  if (status === 'ok') return 'תקין';
  if (status === 'defect') return 'ליקוי';
  return '—';
}

export function triFormFileName(plate: string, dateIso: string): string {
  const plateSafe = String(plate || 'רכב').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'רכב';
  const date = (formatInspectionDateHe(dateIso) || 'ללא-תאריך').replace(/[\\/:*?"<>|]+/g, '-');
  return `טופס-תלת-חצי-${plateSafe}-${date}.pdf`;
}

export function assembleTriInspectionForm(source: TriFormSource): TriInspectionFormModel {
  const plate = dash(source.plate);
  const passed = source.overallStatus === 'passed';
  const { km, generalNotes } = parseInspectionNotes(stripEmbeddedSignature(source.notes));
  const items = source.items || [];
  const tasks = source.tasks || [];

  const notes: TriFormNote[] = [];
  if (generalNotes) notes.push({ label: 'הערה כללית', text: generalNotes });
  items.forEach((item) => {
    const text = (item.notes || '').trim();
    if (!text) return;
    notes.push({
      label: `${item.item_name || 'סעיף'}${item.status === 'defect' ? ' (ליקוי)' : ''}`,
      text,
    });
  });
  const itemNoteTexts = new Set(notes.map((entry) => entry.text));
  tasks.forEach((task) => {
    const text = (task.description || '').trim();
    if (!text || itemNoteTexts.has(text) || text.startsWith('ליקוי שנמצא בבדיקה')) return;
    notes.push({ label: task.title || 'משימת טיפול', text });
  });

  return {
    title: `ביקורת רכב ${plate}`,
    stamp: passed ? 'תקין' : 'ליקויים',
    passed,
    fileName: triFormFileName(source.plate, source.inspectionDate),
    fields: [
      { label: 'מספר רכב', value: plate },
      { label: 'מספר פנימי', value: dash(source.internalNumber) },
      { label: 'שנת הרכב', value: dash(source.year) },
      { label: 'תאריך הביקורת', value: dash(formatInspectionDateHe(source.inspectionDate)) },
      { label: 'מועד בדיקה הבאה', value: dash(formatInspectionDateHe(source.nextDueDate)) },
      { label: 'בודק', value: dash(source.inspectorName) },
      { label: 'סוג הביקורת', value: 'תלת/חצי שנתית' },
      { label: 'קילומטראז׳ בבדיקה', value: dash(km) },
    ],
    signatureSrc: String(source.signatureSrc || '').trim(),
    inspectorName: String(source.inspectorName || '').trim(),
    notes,
    defects: items
      .filter((item) => item.status === 'defect')
      .map((item) => ({
        label: item.item_name || 'ליקוי',
        text: (item.notes || '').trim() || 'ללא פירוט נוסף',
      })),
    items: items.map((item) => ({
      label: item.item_name || 'סעיף',
      text: (item.notes || '').trim(),
    })),
    itemResult: items.map((item) => itemResult(item.status)),
    tasks: tasks.map((task) => ({
      label: task.title || 'משימת טיפול',
      text: [task.description, task.status ? `סטטוס: ${task.status}` : ''].filter(Boolean).join('\n'),
    })),
  };
}
