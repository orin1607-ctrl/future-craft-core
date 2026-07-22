-- Declaration templates: per-company editable affidavit templates
-- Staging-first; keeps driver_declarations.declaration_text as immutable snapshot.

CREATE TABLE IF NOT EXISTS public.declaration_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  -- Extensible metadata for future dynamic fields / UI hints
  -- e.g. [{"key":"id_number","label":"ת.ז"},{"key":"driver_name","label":"שם נהג"}]
  placeholders JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT declaration_templates_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT declaration_templates_body_not_blank CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_declaration_templates_company
  ON public.declaration_templates (company_name);

-- At most one default template per company
CREATE UNIQUE INDEX IF NOT EXISTS declaration_templates_one_default_per_company
  ON public.declaration_templates (company_name)
  WHERE is_default = true;

-- Optional link from a created declaration back to the template used (nullable for legacy rows)
ALTER TABLE public.driver_declarations
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.declaration_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_driver_declarations_template_id
  ON public.driver_declarations (template_id);

-- Keep a single default when is_default is set to true
CREATE OR REPLACE FUNCTION public.ensure_single_default_declaration_template()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default IS TRUE THEN
    UPDATE public.declaration_templates
    SET is_default = false,
        updated_at = now()
    WHERE company_name = NEW.company_name
      AND id IS DISTINCT FROM NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_declaration_templates_single_default ON public.declaration_templates;
CREATE TRIGGER trg_declaration_templates_single_default
  BEFORE INSERT OR UPDATE OF is_default
  ON public.declaration_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_default_declaration_template();

CREATE OR REPLACE FUNCTION public.set_declaration_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_declaration_templates_updated_at ON public.declaration_templates;
CREATE TRIGGER trg_declaration_templates_updated_at
  BEFORE UPDATE ON public.declaration_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_declaration_templates_updated_at();

ALTER TABLE public.declaration_templates ENABLE ROW LEVEL SECURITY;

-- Drivers and managers can read templates for their company (display / create flow)
CREATE POLICY "Users can view company declaration templates"
  ON public.declaration_templates FOR SELECT TO authenticated
  USING (
    company_name = public.get_user_company(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Only fleet managers (same company) and super admins can create templates
CREATE POLICY "Managers can create declaration templates"
  ON public.declaration_templates FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid())
    )
  );

-- Only fleet managers (same company) and super admins can update templates
CREATE POLICY "Managers can update declaration templates"
  ON public.declaration_templates FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid())
    )
  );

-- Only fleet managers (same company) and super admins can delete templates
CREATE POLICY "Managers can delete declaration templates"
  ON public.declaration_templates FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid())
    )
  );

-- Seed a default "תצהיר כללי" for every known company (idempotent)
INSERT INTO public.declaration_templates (company_name, name, body, is_default, placeholders)
SELECT
  c.company_name,
  'תצהיר כללי',
  $decl$אני החתום מטה, בעל תעודת זהות מספר {{id_number}},
מצהיר בזה כי לא נתגלו אצלי, לפי מיטב ידיעתי, מגבלות במערכת העצבים, העצמות,
הראיה או השמיעה ומצב בריאותי הנוכחי כשיר לנהיגה.

1. לא נפסלתי מלהחזיק ברישיון נהיגה מ: בית משפט, רשות הרישוי או קצין משטרה,
ולחלופין רישיון הנהיגה אשר ברשותי לא הותלה על ידי גורמים כאמור.
2. אין לי כל מגבלה בריאותית או רפואית המונעת ממני מלהחזיק ברישיון הנהיגה.
3. איננו צורך סמים.
4. איננו צורך אלכוהול מעבר לכמות המותרת על פי דין.
5. אני מצהיר כי לא חל כל שינוי במצב בריאותי במשך חמש השנים האחרונות.

אני מתחייב כי במידה ויבוטלו הגבלות איזה שהן על רישיון הנהיגה אשר ברשותי,
ולחלופין במידה ויחול שינוי במצב בריאותי באופן המונע ממני מלהמשיך ולנהוג,
אדווח על כך מיידית לקצין הבטיחות.

ידוע לי כי בהתאם לתקנות 585א׳ – 585כ׳ יבדקו פרטי רישיון הנהיגה/מידע העבודות שלי
ע״י קצין הבטיחות המעניק שרותי בטיחות בחברה.

אני מצהיר בזה כי הצהרתי הנ״ל אמת$decl$,
  true,
  '[{"key":"id_number","label":"תעודת זהות"},{"key":"driver_name","label":"שם נהג"},{"key":"license_number","label":"מספר רישיון"},{"key":"company_name","label":"שם חברה"},{"key":"date","label":"תאריך"}]'::jsonb
FROM (
  SELECT DISTINCT company_name
  FROM (
    SELECT company_name FROM public.company_settings WHERE company_name IS NOT NULL AND btrim(company_name) <> ''
    UNION
    SELECT company_name FROM public.drivers WHERE company_name IS NOT NULL AND btrim(company_name) <> ''
    UNION
    SELECT company_name FROM public.profiles WHERE company_name IS NOT NULL AND btrim(company_name) <> ''
  ) names
) c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.declaration_templates t
  WHERE t.company_name = c.company_name
    AND t.is_default = true
);
