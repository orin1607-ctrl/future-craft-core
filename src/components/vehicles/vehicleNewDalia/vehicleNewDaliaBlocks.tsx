import { cloneElement, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { useDaliaFormValues } from './DaliaFormValuesContext';

function bindControl(
  child: ReactElement,
  name: string,
  value: string,
  onChange: (value: string) => void,
): ReactElement {
  const tag = child.type;
  const isSelect = tag === 'select';
  const isTextarea = tag === 'textarea';
  const isInput = tag === 'input';

  if (!isSelect && !isTextarea && !isInput) {
    return child;
  }

  const fallback =
    (child.props as { defaultValue?: string }).defaultValue ??
    (child.props as { value?: string }).value ??
    '';
  const props: Record<string, unknown> = {
    name,
    value: value || fallback,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
  };
  if (isInput && (child.props as { type?: string }).type) {
    props.type = (child.props as { type?: string }).type;
  }

  return cloneElement(child, props);
}

export function Fld({
  label,
  name,
  required,
  type = 'text',
  children,
  className = '',
  defaultValue,
}: {
  label: string;
  name?: string;
  required?: boolean;
  type?: string;
  children?: ReactNode;
  className?: string;
  /** ערך התחלתי כשאין context (למשל סוג ביטוח קבוע) */
  defaultValue?: string;
}) {
  const form = useDaliaFormValues();
  const fieldName = name ?? '';

  if (form && fieldName) {
    const value = form.getValue(fieldName) || defaultValue || '';
    const onChange = (v: string) => form.setValue(fieldName, v);

    return (
      <div className={`d-fld ${required ? 'd-required' : ''} ${className}`}>
        <label>{label}</label>
        {children
          ? isValidElement(children)
            ? bindControl(children, fieldName, value, onChange)
            : children
          : (
            <input name={fieldName} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
          )}
      </div>
    );
  }

  return (
    <div className={`d-fld ${required ? 'd-required' : ''} ${className}`}>
      <label>{label}</label>
      {children ?? <input name={name} type={type} defaultValue={defaultValue} />}
    </div>
  );
}

export function PledgeFields({ prefix }: { prefix: string }) {
  return (
    <div className="d-g2">
      <Fld label="למי משועבד" name={`${prefix}_pledged_to`} />
      <Fld label="מספר שעבוד" name={`${prefix}_pledge_number`} />
      <Fld label="תאריך התחלת שעבוד" name={`${prefix}_pledge_start`} type="date" />
      <Fld label="תאריך סיום שעבוד" name={`${prefix}_pledge_end`} type="date" />
      <Fld label="קישור למסמך שעבוד" name={`${prefix}_pledge_link`} />
      <Fld label="העלאת מסמך שעבוד" name={`${prefix}_pledge_file_name`}>
        <FileWrap name={`${prefix}_pledge_file`} textName={`${prefix}_pledge_file_name`} />
      </Fld>
      <Fld label="הערות שעבוד" name={`${prefix}_pledge_notes`} className="d-full">
        <textarea name={`${prefix}_pledge_notes`} />
      </Fld>
    </div>
  );
}

export function LoanFields({ prefix }: { prefix: string }) {
  return (
    <div className="d-g2">
      <Fld label="חברת מימון / בנק" name={`${prefix}_loan_bank`} />
      <Fld label="מספר הסכם הלוואה" name={`${prefix}_loan_agreement`} />
      <Fld label="סכום הלוואה מקורי" name={`${prefix}_loan_original_amount`} type="number" />
      <Fld label="יתרת הלוואה" name={`${prefix}_loan_balance`} type="number" />
      <Fld label="תאריך התחלה" name={`${prefix}_loan_start`} type="date" />
      <Fld label="תאריך סיום" name={`${prefix}_loan_end`} type="date" />
      <Fld label="ריבית" name={`${prefix}_loan_interest`} type="number" />
      <Fld label="החזר חודשי" name={`${prefix}_loan_monthly_payment`} type="number" />
      <Fld label="מספר תשלומים" name={`${prefix}_loan_payments`} type="number" />
      <Fld label="תשלומים שנותרו" name={`${prefix}_loan_payments_left`} type="number" />
      <Fld label="קישור למסמך הלוואה" name={`${prefix}_loan_link`} />
      <Fld label="העלאת מסמך הלוואה" name={`${prefix}_loan_file_name`}>
        <FileWrap name={`${prefix}_loan_file`} textName={`${prefix}_loan_file_name`} />
      </Fld>
      <Fld label="הערות הלוואה" name={`${prefix}_loan_notes`} className="d-full">
        <textarea name={`${prefix}_loan_notes`} />
      </Fld>
    </div>
  );
}

export function OwnershipBasicFields({ prefix, ownerLabel }: { prefix: string; ownerLabel: string }) {
  return (
    <div className="d-g2">
      <Fld label={ownerLabel} name={`${prefix}_owner`} />
      <Fld label="תאריך רכישה" name={`${prefix}_purchase_date`} type="date" />
      <Fld label="קישור למסמך בעלות" name={`${prefix}_ownership_link`} />
      <Fld label="העלאת מסמך בעלות" name={`${prefix}_ownership_file_name`}>
        <FileWrap name={`${prefix}_ownership_file`} textName={`${prefix}_ownership_file_name`} />
      </Fld>
      <Fld label="הערות בעלות" name={`${prefix}_ownership_notes`} className="d-full">
        <textarea name={`${prefix}_ownership_notes`} />
      </Fld>
    </div>
  );
}

export function FileWrap({ name, textName }: { name: string; textName: string }) {
  return (
    <div className="d-file-wrap">
      <input type="text" name={textName} readOnly placeholder="שם קובץ..." />
      <label className="d-btn small" style={{ margin: 0 }}>
        העלה
        <input
          type="file"
          name={name}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const text = e.target.closest('.d-file-wrap')?.querySelector(`input[name="${textName}"]`) as HTMLInputElement;
            if (text) text.value = f.name;
          }}
        />
      </label>
    </div>
  );
}

export function InsuranceBlock({ title, prefix }: { title: string; prefix: string }) {
  return (
    <div className="d-card">
      <div className="d-block-title">{title}</div>
      <div className="d-g2">
        <Fld label="חברת ביטוח" name={`${prefix}_company`} />
        <Fld label="סוכן ביטוח" name={`${prefix}_agent`} />
        <Fld label="מספר פוליסה" name={`${prefix}_policy`} />
        <Fld label="סוג ביטוח" name={`${prefix}_type`} defaultValue={title} />
        <Fld label="תאריך התחלה" name={`${prefix}_start`} type="date" />
        <Fld label="תאריך סיום" name={`${prefix}_end`} type="date" />
        <Fld label="סטטוס" name={`${prefix}_status`} />
        <Fld label="עלות" name={`${prefix}_cost`} type="number" />
        <Fld label="אופן תשלום" name={`${prefix}_payment_method`} />
        <Fld label="קישור למסמך" name={`${prefix}_doc_link`} />
        <Fld label="העלאת קובץ פוליסה" name={`${prefix}_file_name`}>
          <FileWrap name={`${prefix}_file`} textName={`${prefix}_file_name`} />
        </Fld>
        <Fld label="הערות" name={`${prefix}_notes`} className="d-full">
          <textarea name={`${prefix}_notes`} />
        </Fld>
      </div>
    </div>
  );
}

export function LeasingRouteFields({ prefix }: { prefix: string }) {
  return (
    <div className="d-g2">
      <Fld label="חברת ליסינג / השכרה" name={`${prefix}_company`} />
      <Fld label="מספר הסכם" name={`${prefix}_agreement`} />
      <Fld label="עלות חודשית" name={`${prefix}_monthly_cost`} type="number" />
      <Fld label="קילומטר כלול" name={`${prefix}_included_km`} type="number" />
      <Fld label="עלות חריגה" name={`${prefix}_extra_cost`} />
      <Fld label="אחריות תחזוקה" name={`${prefix}_maintenance_responsibility`} />
      <Fld label="תאריך תחילה" name={`${prefix}_start`} type="date" />
      <Fld label="תאריך סיום" name={`${prefix}_end`} type="date" />
      <Fld label="יתרת תשלומים" name={`${prefix}_remaining_payments`} type="number" />
      <Fld label="איש קשר" name={`${prefix}_contact`} />
      <Fld label="טלפון" name={`${prefix}_phone`} />
      <Fld label="מייל" name={`${prefix}_email`} type="email" />
      <Fld label="קישור להסכם" name={`${prefix}_agreement_link`} />
      <Fld label="העלאת קובץ הסכם" name={`${prefix}_agreement_file_name`}>
        <FileWrap name={`${prefix}_agreement_file`} textName={`${prefix}_agreement_file_name`} />
      </Fld>
      <Fld label="הערות" name={`${prefix}_notes`} className="d-full">
        <textarea name={`${prefix}_notes`} />
      </Fld>
    </div>
  );
}

export const ROUTE_MAP: Record<string, string> = {
  'ליסינג תפעולי': 'route-operational',
  'ליסינג מימוני': 'route-finance-lease',
  'הלוואה / מימון': 'route-loan',
  'תחזוקה עצמאית': 'route-self',
  'שירות ותחזוקה': 'route-service',
  'בעלות חברה': 'route-company',
  'בעלות פרטית': 'route-private',
  'השכרה': 'route-rent',
  'אחר': 'route-other',
};
