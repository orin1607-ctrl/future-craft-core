-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Re-check website hiring findings with the corrected patterns: "לשליחת קורות חיים" (send your CV) is not a courier job and
-- "הנהגת" (leadership) is not a driver. Findings whose quoted lines no longer qualify are marked rejected (kept, not deleted).
UPDATE public.nr_findings f SET match_status = 'rejected', reviewed_at = now(), updated_at = now(),
       detail = f.detail || '{"rejected_reason":"הבדיקה החוזרת: השורות שצוטטו אינן משרת לוגיסטיקה / נהג"}'
 WHERE f.source_key = 'enr:web_deep' AND f.match_status = 'matched' AND f.category IN ('hiring_logistics','hiring_drivers')
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(f.detail->'lines') l
                    WHERE (f.category = 'hiring_logistics' AND l ~ '(מחסנ|לוגיסט|מפיץ|סדרן|הפצה|מנהל(ת)? תפעול|(^|[^א-ת])[לוב]?שליח(ים|/ה)?([^א-ת]|$))')
                       OR (f.category = 'hiring_drivers' AND l ~ '((^|[^א-ת])[לוב]?נהג(ת|ים|י|/ת|/ה)?([^א-ת]|$)|משאית|מלגזן)'));
SELECT public.nr_refresh_enrich(ARRAY(SELECT business_id FROM public.nr_findings WHERE source_key = 'enr:web_deep' AND category IN ('hiring_logistics','hiring_drivers')));
SELECT category, match_status, count(*) FROM public.nr_findings WHERE source_key = 'enr:web_deep' AND category LIKE 'hiring%' GROUP BY 1, 2 ORDER BY 1, 2;
