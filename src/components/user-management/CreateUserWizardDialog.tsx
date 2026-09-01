import { useEffect, useMemo, useState } from 'react';
import {
  User,
  Building2,
  Car,
  Users,
  Phone,
  Scale,
  ChevronLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AccessCodePanel from '@/components/user-management/AccessCodePanel';
import CreateUserResultPanel, {
  type CreateUserResultReport,
} from '@/components/user-management/CreateUserResultPanel';
import {
  type UserCreationType,
  type CreateUserFormValues,
  USER_TYPE_LABELS,
  USER_TYPE_DESCRIPTIONS,
  FIELDS_BY_TYPE,
  ROLE_MAP,
  emptyFormForType,
} from '@/lib/userManagementSchema';
import { generateAccessCode } from '@/lib/accessCodeTypes';
import { DEFAULT_ACCESS_CODE_CONFIG, type AccessCodeConfig } from '@/lib/accessCodeTypes';
import { isStagingTestLoginEmail, STAGING_TEST_LOGIN_EMAIL } from '@/lib/userManagementStaging';
import {
  getEdgeFunctionErrorMessage,
  isEmailActuallySent,
  parseResendError,
  diagnoseResendFailure,
  type AccessCodeSendResult,
} from '@/lib/edgeFunctionError';
import { cn } from '@/lib/utils';
import { BUSINESS_CUSTOMER_SERVICE_TYPES } from '@/lib/marketingProvision';

const TYPE_ICONS: Record<UserCreationType, typeof User> = {
  private_customer: User,
  business_customer: Building2,
  fleet_manager: Users,
  driver: Car,
  telemarketing_agent: Phone,
  claims_worker: Scale,
};

const STEPS = ['סוג משתמש', 'פרטים', 'קוד גישה', 'סיכום'] as const;
const RESULT_STEP = 4;

interface CreateUserWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyOptions: string[];
  onCreated: () => void;
}

export default function CreateUserWizardDialog({
  open,
  onOpenChange,
  companyOptions,
  onCreated,
}: CreateUserWizardDialogProps) {
  const [step, setStep] = useState(0);
  const [userType, setUserType] = useState<UserCreationType | null>(null);
  const [form, setForm] = useState<CreateUserFormValues>({});
  const [accessCode, setAccessCode] = useState<AccessCodeConfig>(DEFAULT_ACCESS_CODE_CONFIG);
  const [creating, setCreating] = useState(false);
  const [resultReport, setResultReport] = useState<CreateUserResultReport | null>(null);
  const [vehicles, setVehicles] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setUserType(null);
      setForm({});
      setAccessCode(DEFAULT_ACCESS_CODE_CONFIG);
      setResultReport(null);
    }
  }, [open]);

  useEffect(() => {
    if (userType === 'driver' && open) {
      supabase
        .from('vehicles')
        .select('id, license_plate, manufacturer, model')
        .order('license_plate')
        .limit(200)
        .then(({ data }) => {
          setVehicles(
            (data || []).map((v) => ({
              id: v.id,
              label: [v.license_plate, v.manufacturer, v.model].filter(Boolean).join(' · '),
            })),
          );
        });
    }
  }, [userType, open]);

  const fields = userType ? FIELDS_BY_TYPE[userType] : [];

  const loginEmail = form.login_email || form.email || '';

  useEffect(() => {
    if (step === 2 && accessCode.mode === 'auto' && !accessCode.code) {
      setAccessCode((c) => ({ ...c, code: generateAccessCode() }));
    }
  }, [step, accessCode.mode, accessCode.code]);

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectType = (type: UserCreationType) => {
    setUserType(type);
    setForm(emptyFormForType(type));
    setStep(1);
  };

  const validateStep1 = (): boolean => {
    if (!userType) return false;
    const required = fields.filter((fd) => fd.required);
    for (const fd of required) {
      if (fd.key === 'login_email' && form.noEmail) continue;
      const val = form[fd.key]?.trim();
      if (!val) {
        toast({ title: 'שדה חסר', description: `יש למלא: ${fd.label}`, variant: 'destructive' });
        return false;
      }
    }
    if (!form.noEmail && !form.login_email?.trim() && userType !== 'driver') {
      toast({ title: 'שדה חסר', description: 'יש למלא אימייל התחברות', variant: 'destructive' });
      return false;
    }
    if (userType === 'driver' && !form.password?.trim()) {
      toast({ title: 'שדה חסר', description: 'יש למלא סיסמה / קוד כניסה', variant: 'destructive' });
      return false;
    }
    const pwd = form.password?.trim() || accessCode.code?.trim() || '';
    if (pwd.length > 0 && pwd.length < 6) {
      toast({ title: 'סיסמה קצרה מדי', description: 'סיסמה / קוד כניסה חייבים להכיל לפחות 6 תווים', variant: 'destructive' });
      return false;
    }
    if (userType === 'business_customer') {
      const st = form.service_type || 'marketing_only';
      if (!st) {
        toast({ title: 'שדה חסר', description: 'יש לבחור סוג שירות', variant: 'destructive' });
        return false;
      }
    }
    return true;
  };

  const buildCreatePayload = () => {
    if (!userType) return null;
    const role = ROLE_MAP[userType];
    const email =
      form.login_email?.trim() ||
      form.email?.trim() ||
      (form.phone ? `${form.phone.replace(/\D/g, '')}@placeholder.local` : '');
    const company =
      userType === 'private_customer'
        ? ''
        : form.company_assigned || form.company_name || (userType === 'claims_worker' ? 'ניהול תביעות' : '');
    const fullName =
      userType === 'business_customer'
        ? form.contact_person || form.company_name || ''
        : form.full_name || form.contact_person || form.company_name || '';
    const password = form.password?.trim() || accessCode.code || '';

    return {
      email,
      password,
      full_name: fullName,
      phone: form.phone || '',
      role,
      company_name: company,
      is_active: false,
      approval_status: 'pending',
      nickname: form.nickname || undefined,
      address: form.address || undefined,
      contact_email: form.email || undefined,
      job_title: form.job_title || undefined,
      notes: form.notes || undefined,
      permissions: form.permissions || undefined,
      user_number: form.user_number || undefined,
      contact_role: form.contact_role || undefined,
      activity_field: form.activity_field || undefined,
      business_id: form.business_id || undefined,
      service_type: userType === 'business_customer' ? (form.service_type || 'marketing_only') : undefined,
      license_number: form.license_number || undefined,
      assigned_vehicle_id: form.assigned_vehicle_id || undefined,
      skip_driver_row: userType === 'claims_worker',
    };
  };

  const handleCreate = async () => {
    if (!userType) return;
    const payload = buildCreatePayload();
    if (!payload?.email || !payload.password || !payload.full_name) {
      toast({ title: 'שגיאה', description: 'חסרים שדות חובה ליצירה', variant: 'destructive' });
      return;
    }

    setCreating(true);
    setResultReport(null);

    const { data, error } = await supabase.functions.invoke('create-admin-user', {
      body: payload,
    });

    if (error || data?.error) {
      setCreating(false);
      const msg = await getEdgeFunctionErrorMessage(error, data);
      toast({ title: 'שגיאה ביצירה', description: msg, variant: 'destructive' });
      return;
    }

    const userId = data?.user_id as string | undefined;
    if (userId && userType === 'claims_worker') {
      const { error: grantErr } = await supabase.rpc('claims_set_access' as never, {
        p_user_id: userId,
        p_enabled: true,
        p_worker_only: true,
      } as never);
      if (grantErr) {
        toast({
          title: 'המשתמש נוצר — שגיאה בהרשאת Claims',
          description: grantErr.message,
          variant: 'destructive',
        });
      }
      await supabase.from('drivers').delete().eq('id', userId);
    }
    const hadAccessCode = !!accessCode.code;

    let report: CreateUserResultReport = {
      userCreated: true,
      userId,
      loginEmail,
      codeSaved: false,
      hadAccessCode,
      emailRequested: accessCode.sendToEmail,
      emailSent: false,
      resendStatus: null,
      resendError: null,
      sentToEmailAt: null,
      resendDiagnosis: null,
      fromAddress: null,
      reusedTestUser: data?.reused_test_user === true,
    };

    if (userId && accessCode.code) {
      const { data: sendRes, error: codeErr } = await supabase.functions.invoke('send-user-access-code', {
        body: {
          user_id: userId,
          code: accessCode.code,
          mode: accessCode.mode,
          email: loginEmail,
          send_email: accessCode.sendToEmail,
        },
      });

      if (codeErr || sendRes?.error) {
        const msg = await getEdgeFunctionErrorMessage(codeErr, sendRes);
        report = { ...report, codeSaved: false, codeError: msg };
        toast({
          title: 'המשתמש נוצר — שגיאה בשמירת קוד',
          description: msg,
          variant: 'destructive',
        });
        setResultReport(report);
        setStep(RESULT_STEP);
        setCreating(false);
        onCreated();
        return;
      }

      const sendResult = sendRes as AccessCodeSendResult | null;
      const parsedError = sendResult?.resend_error ? parseResendError(sendResult.resend_error) : null;

      report = {
        ...report,
        codeSaved: sendResult?.code_saved !== false,
        emailRequested: sendResult?.email_requested ?? accessCode.sendToEmail,
        emailSent: isEmailActuallySent(sendResult),
        resendStatus: sendResult?.resend_status ?? null,
        resendError: parsedError,
        fromAddress: sendResult?.from ?? null,
        resendDiagnosis: diagnoseResendFailure(sendResult?.resend_error, sendResult?.from),
      };

      const { data: codeRow } = await supabase
        .from('user_access_codes')
        .select('sent_to_email_at')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      report.sentToEmailAt = codeRow?.sent_to_email_at ?? null;

      if (report.emailRequested) {
        if (report.emailSent) {
          toast({
            title: 'המשתמש נוצר והקוד נשלח לאימייל בפועל',
            description: `קוד הגישה נשלח ל-${loginEmail}. Resend אישר (HTTP 200).`,
          });
        } else {
          toast({
            title: 'המשתמש נוצר והקוד נשמר, אבל האימייל לא נשלח',
            description: parsedError || report.resendDiagnosis || 'Resend לא אישר שליחה',
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'המשתמש נוצר',
          description: 'הקוד נשמר ב-DB. לא בוצעה שליחה לאימייל.',
        });
      }
    } else {
      toast({
        title: 'המשתמש נוצר',
        description: 'המשתמש נשמר עם סטטוס ממתין לאישור.',
      });
    }

    setResultReport(report);
    setStep(RESULT_STEP);
    setCreating(false);
    onCreated();
  };

  const summaryItems = useMemo(() => {
    if (!userType) return [];
    return fields.map((fd) => ({
      label: fd.label,
      value: form[fd.key] || '—',
    }));
  }, [userType, fields, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Users size={22} className="text-primary" />
            פתיחת משתמש חדש
          </DialogTitle>
          <div className="flex gap-1 pt-2 flex-wrap">
            {STEPS.map((label, i) => (
              <Badge
                key={label}
                variant={i === step ? 'default' : i < step ? 'secondary' : 'outline'}
                className="text-xs"
              >
                {i + 1}. {label}
              </Badge>
            ))}
            {step === RESULT_STEP && (
              <Badge variant="default" className="text-xs">
                5. תוצאה
              </Badge>
            )}
          </div>
        </DialogHeader>

        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 py-2">
            {(Object.keys(USER_TYPE_LABELS) as UserCreationType[]).map((type) => {
              const Icon = TYPE_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  data-testid={type === 'claims_worker' ? 'create-user-type-claims_worker' : `create-user-type-${type}`}
                  onClick={() => selectType(type)}
                  className="card-elevated text-right p-3 hover:border-primary/40 transition-colors min-h-[84px]"
                >
                  <Icon size={22} className="text-primary mb-1" />
                  <p className="font-bold text-sm">{USER_TYPE_LABELS[type]}</p>
                  <p className="text-xs text-muted-foreground mt-1">{USER_TYPE_DESCRIPTIONS[type]}</p>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && userType && (
          <div className="space-y-3 py-1">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="text-sm text-primary flex items-center gap-1 mb-2"
            >
              <ChevronLeft size={16} className="rotate-180" />
              חזרה לבחירת סוג
            </button>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm">
              כל משתמש חדש נוצר <strong>לא פעיל</strong> — ממתין לאישור מנהל מערכת לפני גישה.
            </div>
            {userType === 'claims_worker' && (
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 text-sm">
                עובד ניהול תביעות רואה רק את אזור Claims ואת התביעות שיוקצו אליו.
              </div>
            )}

            {userType === 'driver' && (
              <div className="flex items-center gap-3 p-3 rounded-xl border">
                <input
                  type="checkbox"
                  id="noEmailDriver"
                  checked={!!form.noEmail}
                  onChange={(e) => setForm((p) => ({ ...p, noEmail: e.target.checked }))}
                  className="w-5 h-5 accent-primary"
                />
                <label htmlFor="noEmailDriver" className="text-sm cursor-pointer">
                  אין אימייל — זיהוי לפי טלפון
                </label>
              </div>
            )}

            {fields.map((fd) => {
              if (fd.key === 'login_email' && form.noEmail) return null;
              if (fd.key === 'company_assigned') {
                return (
                  <div key={fd.key}>
                    <label className="text-sm font-medium mb-1 block">{fd.label}{fd.required ? ' *' : ''}</label>
                    <Select value={form.company_assigned || ''} onValueChange={(v) => setField('company_assigned', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="בחר חברה" />
                      </SelectTrigger>
                      <SelectContent>
                        {companyOptions.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              if (fd.key === 'service_type') {
                return (
                  <div key={fd.key}>
                    <label className="text-sm font-medium mb-1 block">{fd.label}{fd.required ? ' *' : ''}</label>
                    <Select value={form.service_type || 'marketing_only'} onValueChange={(v) => setField('service_type', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="בחר סוג שירות" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUSINESS_CUSTOMER_SERVICE_TYPES.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-2">
                      בחירת שיווק יוצרת כרטיס ניהול שיווק מחובר (Client ID אחד) — ללא כפילות.
                    </p>
                  </div>
                );
              }
              if (fd.key === 'assigned_vehicle_id') {
                return (
                  <div key={fd.key}>
                    <label className="text-sm font-medium mb-1 block">{fd.label}</label>
                    <Select
                      value={form.assigned_vehicle_id || ''}
                      onValueChange={(v) => setField('assigned_vehicle_id', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="בחר רכב (אופציונלי)" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              const common = {
                value: form[fd.key] || '',
                onChange: (
                  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                ) => setField(fd.key, e.target.value),
                placeholder: fd.placeholder || fd.label,
                dir: fd.dir,
                className: cn(fd.dir === 'ltr' && 'text-right'),
                'data-testid': `create-user-field-${fd.key}`,
              };
              return (
                <div key={fd.key}>
                  <label className="text-sm font-medium mb-1 flex items-center gap-2">
                    {fd.label}{fd.required ? ' *' : ''}
                  </label>
                  {fd.type === 'textarea' ? (
                    <Textarea {...common} rows={3} />
                  ) : (
                    <Input type={fd.type === 'password' ? 'password' : fd.type === 'email' ? 'email' : 'text'} {...common} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm text-primary flex items-center gap-1"
            >
              <ChevronLeft size={16} className="rotate-180" />
              חזרה לפרטים
            </button>
            <AccessCodePanel
              config={accessCode}
              onChange={setAccessCode}
              loginEmail={loginEmail}
            />
          </div>
        )}

        {step === 3 && userType && (
          <div className="space-y-4 py-1">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-sm text-primary flex items-center gap-1"
            >
              <ChevronLeft size={16} className="rotate-180" />
              חזרה לקוד גישה
            </button>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 size={20} />
              <span className="font-bold">סיכום לפני יצירה</span>
            </div>
            <p className="text-sm">
              סוג: <strong>{USER_TYPE_LABELS[userType]}</strong>
              {' · '}
              סטטוס: <strong>ממתין לאישור</strong>
            </p>
            <div className="rounded-xl border divide-y max-h-48 overflow-y-auto">
              {summaryItems.map((item) => (
                <div key={item.label} className="flex justify-between gap-2 p-2 text-sm">
                  <span className="text-muted-foreground shrink-0">{item.label}</span>
                  <span className="font-medium text-left break-all" dir="ltr">{item.value}</span>
                </div>
              ))}
            </div>
            {accessCode.code && (
              <p className="text-sm">קוד גישה: <code dir="ltr">{accessCode.code}</code></p>
            )}
            {accessCode.sendToEmail && (
              <p className="text-sm text-muted-foreground">
                שליחה לאימייל מבוקשת ל: {loginEmail} (יישלח רק אם Resend מאשר)
              </p>
            )}
            {isStagingTestLoginEmail(loginEmail) && (
              <p className="text-sm rounded-lg border border-primary/30 bg-primary/5 p-3 text-muted-foreground">
                אימייל בדיקות Staging: <strong dir="ltr">{STAGING_TEST_LOGIN_EMAIL}</strong>
                {' '}— ניתן ליצור שוב עם אותו אימייל התחברות (ללא שגיאת כפילות).
              </p>
            )}
          </div>
        )}

        {step === RESULT_STEP && resultReport && (
          <CreateUserResultPanel report={resultReport} />
        )}

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          {step === RESULT_STEP ? (
            <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              סגור
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {step === 0 ? 'ביטול' : 'חזור לרשימה'}
              </Button>
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                  הקודם
                </Button>
              )}
              {step > 0 && step < 3 && (
                <Button
                  onClick={() => {
                    if (step === 1 && !validateStep1()) return;
                    setStep((s) => s + 1);
                  }}
                >
                  המשך
                </Button>
              )}
              {step === 3 && (
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 size={16} className="animate-spin ml-2" /> : null}
                  צור משתמש (ממתין לאישור)
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
