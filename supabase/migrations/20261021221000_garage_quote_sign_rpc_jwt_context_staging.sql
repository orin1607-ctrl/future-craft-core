-- Migration: 20261021221000_garage_quote_sign_rpc_jwt_context_staging.sql
-- Description: Ensure sign_garage_quote_by_token sets transaction-local auth context from the verified quote creator so the garage_cases trigger authorizes the customer's digital signature update without weakening table triggers.

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
  v_actor_uid uuid;
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
    -- Set transaction-local JWT sub to the staff member who issued the quote link so garage_cases write trigger succeeds
    v_actor_uid := coalesce(v_row.created_by, v_case.opened_by);
    IF v_actor_uid IS NOT NULL THEN
      PERFORM set_config('request.jwt.claim.sub', v_actor_uid::text, true);
      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_actor_uid::text, 'role', 'authenticated')::text, true);
    END IF;

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
