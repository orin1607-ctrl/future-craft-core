import { supabase } from '@/integrations/supabase/client';

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const db = supabase as unknown as RpcClient;

function firstRow<T>(data: unknown): T | null {
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as T) || null;
  return data as T;
}

export async function getDeclarationByToken<T = Record<string, unknown>>(token: string) {
  const { data, error } = await db.rpc('get_declaration_by_token', { p_token: token });
  if (error) return { data: null as T | null, error };
  return { data: firstRow<T>(data), error: null };
}

export async function signDeclarationByToken<T = Record<string, unknown>>(token: string, signatureUrl: string) {
  const { data, error } = await db.rpc('sign_declaration_by_token', {
    p_token: token,
    p_signature_url: signatureUrl,
  });
  if (error) return { data: null as T | null, error };
  return { data: firstRow<T>(data), error: null };
}

export async function getDrivingExamByToken<T = Record<string, unknown>>(token: string) {
  const { data, error } = await db.rpc('get_driving_exam_by_token', { p_token: token });
  if (error) return { data: null as T | null, error };
  return { data: firstRow<T>(data), error: null };
}

export async function startDrivingExamByToken<T = Record<string, unknown>>(token: string) {
  const { data, error } = await db.rpc('start_driving_exam_by_token', { p_token: token });
  if (error) return { data: null as T | null, error };
  return { data: firstRow<T>(data), error: null };
}

export async function submitDrivingExamByToken<T = Record<string, unknown>>(params: {
  token: string;
  answers: unknown;
  score: number;
  correct_count: number;
  total_questions: number;
  passed: boolean;
  category_breakdown: unknown;
  signature_url: string;
}) {
  const { data, error } = await db.rpc('submit_driving_exam_by_token', {
    p_token: params.token,
    p_answers: params.answers,
    p_score: params.score,
    p_correct_count: params.correct_count,
    p_total_questions: params.total_questions,
    p_passed: params.passed,
    p_category_breakdown: params.category_breakdown,
    p_signature_url: params.signature_url,
  });
  if (error) return { data: null as T | null, error };
  return { data: firstRow<T>(data), error: null };
}
