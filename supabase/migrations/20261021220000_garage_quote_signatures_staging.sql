-- Migration: 20261021220000_garage_quote_signatures_staging.sql
-- Description: Secure digital quote links, versioning, and customer signature system for Garage Management (STAGING)

-- Allow one-time / walk-in customers to be created without inventing a phone number when phone is not yet provided
ALTER TABLE public.garage_customers DROP CONSTRAINT IF EXISTS garage_customers_phone_present;

CREATE TABLE IF NOT EXISTS public.garage_quote_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  case_id uuid NOT NULL REFERENCES public.garage_cases(id) ON DELETE CASCADE,
  case_number text NOT NULL DEFAULT '',
  quote_version integer NOT NULL DEFAULT 1,
  quote_title text NOT NULL DEFAULT 'הצעת מחיר – עבודות פחחות וצבע',
  customer_name text NOT NULL DEFAULT '',
  vehicle_plate text NOT NULL DEFAULT '',
  quote_date text NOT NULL DEFAULT '',
  work_type text NOT NULL DEFAULT '',
  quote_works jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  priced_subtotal numeric(12, 2) NOT NULL DEFAULT 0,
  priced_lines_count integer NOT NULL DEFAULT 0,
  unpriced_lines_count integer NOT NULL DEFAULT 0,
  vat_rate numeric(5, 2) NOT NULL DEFAULT 18.00,
  vat_mode text NOT NULL DEFAULT 'unspecified',
  damage_photos_attached boolean NOT NULL DEFAULT false,
  damage_photos_count integer NOT NULL DEFAULT 0,
  quote_notes text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'link',
  recipient_phone text NOT NULL DEFAULT '',
  recipient_email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ready_to_send',
  sent_at timestamptz,
  signed_at timestamptz,
  signer_name text NOT NULL DEFAULT '',
  signature_data_url text NOT NULL DEFAULT '',
  audit_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  shop_company_name text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_quote_links_status_check CHECK (
    status = ANY (ARRAY['ready_to_send'::text, 'sent'::text, 'signed'::text, 'superseded'::text, 'revoked'::text])
  ),
  CONSTRAINT garage_quote_links_vat_mode_check CHECK (
    vat_mode = ANY (ARRAY['unspecified'::text, 'plus_vat'::text, 'includes_vat'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_garage_quote_links_case_id ON public.garage_quote_links(case_id);
CREATE INDEX IF NOT EXISTS idx_garage_quote_links_token ON public.garage_quote_links(token);

ALTER TABLE public.garage_quote_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "garage_quote_links_select_shop" ON public.garage_quote_links;
DROP POLICY IF EXISTS "garage_quote_links_insert_shop" ON public.garage_quote_links;
DROP POLICY IF EXISTS "garage_quote_links_update_shop" ON public.garage_quote_links;
DROP POLICY IF EXISTS "garage_quote_links_delete_super_admin" ON public.garage_quote_links;

CREATE POLICY "garage_quote_links_select_shop" ON public.garage_quote_links
  FOR SELECT TO authenticated
  USING (
    public.garage_shop_visible(shop_company_name)
    OR EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_quote_links.case_id AND public.garage_shop_visible(gc.shop_company_name)
    )
  );

CREATE POLICY "garage_quote_links_insert_shop" ON public.garage_quote_links
  FOR INSERT TO authenticated
  WITH CHECK (
    public.garage_shop_visible(shop_company_name)
    OR EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_quote_links.case_id AND public.garage_shop_visible(gc.shop_company_name)
    )
  );

CREATE POLICY "garage_quote_links_update_shop" ON public.garage_quote_links
  FOR UPDATE TO authenticated
  USING (
    public.garage_shop_visible(shop_company_name)
    OR EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_quote_links.case_id AND public.garage_shop_visible(gc.shop_company_name)
    )
  )
  WITH CHECK (
    public.garage_shop_visible(shop_company_name)
    OR EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_quote_links.case_id AND public.garage_shop_visible(gc.shop_company_name)
    )
  );

CREATE POLICY "garage_quote_links_delete_super_admin" ON public.garage_quote_links
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Secure token-gated RPC to fetch a specific quote snapshot for customer viewing/signing
CREATE OR REPLACE FUNCTION public.get_garage_quote_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_row public.garage_quote_links%ROWTYPE;
  v_photos jsonb := '[]'::jsonb;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'קישור הצעת המחיר אינו תקין';
  END IF;

  SELECT * INTO v_row
  FROM public.garage_quote_links
  WHERE token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND OR v_row.status = 'revoked' THEN
    RAISE EXCEPTION 'הצעת המחיר לא נמצאה או שהקישור בוטל';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'case_id', v_row.case_id,
    'case_number', v_row.case_number,
    'quote_version', v_row.quote_version,
    'quote_title', v_row.quote_title,
    'customer_name', v_row.customer_name,
    'vehicle_plate', v_row.vehicle_plate,
    'quote_date', v_row.quote_date,
    'work_type', v_row.work_type,
    'quote_works', v_row.quote_works,
    'quote_parts', v_row.quote_parts,
    'priced_subtotal', v_row.priced_subtotal,
    'priced_lines_count', v_row.priced_lines_count,
    'unpriced_lines_count', v_row.unpriced_lines_count,
    'vat_rate', v_row.vat_rate,
    'vat_mode', v_row.vat_mode,
    'damage_photos_attached', v_row.damage_photos_attached,
    'damage_photos_count', v_row.damage_photos_count,
    'quote_notes', v_row.quote_notes,
    'status', v_row.status,
    'sent_at', v_row.sent_at,
    'signed_at', v_row.signed_at,
    'signer_name', v_row.signer_name,
    'signature_data_url', v_row.signature_data_url,
    'created_at', v_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_garage_quote_by_token(text) TO anon, authenticated;

-- Secure token-gated RPC for customer digital signature submission (immutable once signed)
CREATE OR REPLACE FUNCTION public.sign_garage_quote_by_token(
  p_token text,
  p_signer_name text,
  p_signature_data_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_row public.garage_quote_links%ROWTYPE;
  v_case public.garage_cases%ROWTYPE;
  v_now timestamptz := now();
  v_clean_signer text := trim(coalesce(p_signer_name, ''));
  v_clean_sig text := trim(coalesce(p_signature_data_url, ''));
  v_audit jsonb;
  v_case_data jsonb;
  v_timeline jsonb;
  v_sig_history jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'קישור הצעת המחיר אינו תקין';
  END IF;

  IF length(v_clean_signer) = 0 THEN
    RAISE EXCEPTION 'חובה להזין את שם החותם לאישור הצעת המחיר';
  END IF;

  IF length(v_clean_sig) < 50 OR position('data:image/' in v_clean_sig) <> 1 THEN
    RAISE EXCEPTION 'חובה לחתום בתיבת החתימה לפני אישור ההצעה';
  END IF;

  SELECT * INTO v_row
  FROM public.garage_quote_links
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND OR v_row.status = 'revoked' THEN
    RAISE EXCEPTION 'הצעת המחיר לא נמצאה או שהקישור בוטל';
  END IF;

  IF v_row.status = 'signed' THEN
    RAISE EXCEPTION 'הצעת מחיר זו (גרסה %) כבר נחתמה בתאריך % ולא ניתן לשנותה או לחתום עליה בשנית', v_row.quote_version, to_char(v_row.signed_at, 'DD/MM/YYYY HH24:MI');
  END IF;

  IF v_row.status = 'superseded' THEN
    RAISE EXCEPTION 'גרסה זו של הצעת המחיר הוחלפה בגרסה חדשה יותר ואינה ניתנת לחתימה';
  END IF;

  v_audit := coalesce(v_row.audit_history, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'at', v_now,
      'event', 'signed',
      'signer_name', v_clean_signer,
      'quote_version', v_row.quote_version
    )
  );

  UPDATE public.garage_quote_links
  SET
    status = 'signed',
    signed_at = v_now,
    signer_name = v_clean_signer,
    signature_data_url = v_clean_sig,
    audit_history = v_audit,
    updated_at = v_now
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  -- Update the linked garage_case with immutable signed snapshot and timeline entry
  SELECT * INTO v_case
  FROM public.garage_cases
  WHERE id = v_row.case_id
  FOR UPDATE;

  IF FOUND THEN
    v_case_data := coalesce(v_case.case_data, '{}'::jsonb);
    v_timeline := coalesce(v_case_data->'timeline', '[]'::jsonb);
    v_sig_history := coalesce(v_case_data->'signatureHistory', '[]'::jsonb);

    v_snapshot := jsonb_build_object(
      'quote_link_id', v_row.id,
      'quote_version', v_row.quote_version,
      'quote_title', v_row.quote_title,
      'quote_date', v_row.quote_date,
      'work_type', v_row.work_type,
      'quote_works', v_row.quote_works,
      'quote_parts', v_row.quote_parts,
      'priced_subtotal', v_row.priced_subtotal,
      'priced_lines_count', v_row.priced_lines_count,
      'unpriced_lines_count', v_row.unpriced_lines_count,
      'vat_rate', v_row.vat_rate,
      'vat_mode', v_row.vat_mode,
      'signed_at', v_now,
      'signer_name', v_clean_signer,
      'signature_data_url', v_clean_sig
    );

    v_timeline := v_timeline || jsonb_build_array(
      jsonb_build_object(
        'at', v_now,
        'text', format('הצעת מחיר (גרסה %s) אושרה ונחתמה דיגיטלית ע"י %s', v_row.quote_version, v_clean_signer)
      )
    );

    v_sig_history := v_sig_history || jsonb_build_array(v_snapshot);

    v_case_data := v_case_data || jsonb_build_object(
      'quoteApproved', true,
      'quoteSigned', true,
      'quoteSignedAt', v_now,
      'quoteApprovedAt', v_now,
      'quoteApprovedBy', v_clean_signer,
      'quoteSignerName', v_clean_signer,
      'quoteSignedVersion', v_row.quote_version,
      'quoteSignatureDataUrl', v_clean_sig,
      'quoteSignedSnapshot', v_snapshot,
      'signatureHistory', v_sig_history,
      'signatureCaptured', true,
      'timeline', v_timeline
    );

    UPDATE public.garage_cases
    SET
      status = CASE WHEN status IN ('בדיקת רכב', 'הצעה בהכנה', 'הצעה נשלחה', 'ממתין לאישור') THEN 'אושר לביצוע' ELSE status END,
      case_data = v_case_data,
      updated_at = v_now
    WHERE id = v_case.id;
  END IF;

  RETURN public.get_garage_quote_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_garage_quote_by_token(text, text, text) TO anon, authenticated;
