import { supabase } from '@/integrations/supabase/client';

export const TELEMARKETING_RECORDINGS_BUCKET = 'telemarketing-recordings';
export const RECORDING_SIGNED_URL_TTL_SEC = 900;

export type RecordingStatus = 'none' | 'pending' | 'ready' | 'failed';

type RecorderHandle = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
};

let active: RecorderHandle | null = null;
let recordingGeneration = 0;

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}

export function recordingStoragePath(employeeId: string, callId: string, mimeType: string): string {
  const lower = (mimeType || '').toLowerCase();
  const ext = lower.includes('mp4') ? 'm4a' : lower.includes('mpeg') ? 'mp3' : lower.includes('ogg') ? 'ogg' : 'webm';
  return `${employeeId}/${callId}/audio.${ext}`;
}

export function isBrowserRecordingAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** Starts microphone recording. Never throws. Returns false if unavailable / denied. */
export async function startCallRecording(): Promise<boolean> {
  const generation = ++recordingGeneration;
  try {
    await stopRecorderInstance();
    if (!isBrowserRecordingAvailable()) return false;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (generation !== recordingGeneration) {
      stopTracks(stream);
      return false;
    }
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    try {
      recorder.start(1000);
    } catch {
      recorder.start();
    }
    if (generation !== recordingGeneration) {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
      stopTracks(stream);
      return false;
    }
    active = { recorder, stream, chunks };
    return recorder.state === 'recording';
  } catch {
    if (generation === recordingGeneration) {
      stopTracks(active?.stream ?? null);
      active = null;
    }
    return false;
  }
}

async function stopRecorderInstance(): Promise<Blob | null> {
  const handle = active;
  active = null;
  if (!handle) return null;

  return new Promise((resolve) => {
    const finish = () => {
      stopTracks(handle.stream);
      const type = handle.recorder.mimeType || 'audio/webm';
      const blob = handle.chunks.length > 0 ? new Blob(handle.chunks, { type }) : null;
      resolve(blob && blob.size > 0 ? blob : null);
    };

    const timer = window.setTimeout(finish, 4000);
    if (handle.recorder.state === 'inactive') {
      window.clearTimeout(timer);
      finish();
      return;
    }
    handle.recorder.onstop = () => {
      window.clearTimeout(timer);
      finish();
    };
    try {
      handle.recorder.stop();
    } catch {
      window.clearTimeout(timer);
      finish();
    }
  });
}

/** Stops recorder and returns a blob, or null. Never throws. Does not upload. */
export async function stopCallRecording(): Promise<Blob | null> {
  recordingGeneration += 1;
  try {
    return await stopRecorderInstance();
  } catch {
    return null;
  }
}

export async function markCallRecordingStatus(
  callId: string,
  status: RecordingStatus,
  extra?: { path?: string | null; mime?: string | null },
): Promise<void> {
  try {
    const patch: Record<string, string | null> = { recording_status: status };
    if (extra && 'path' in extra) patch.recording_path = extra.path ?? null;
    if (extra && 'mime' in extra) patch.recording_mime = extra.mime ?? null;
    await supabase.from('telemarketing_calls').update(patch).eq('id', callId);
  } catch {
    /* metadata failure must not affect the call */
  }
}

export async function uploadCallRecording(params: {
  callId: string;
  employeeId: string;
  blob: Blob;
}): Promise<{ status: RecordingStatus; path: string | null; mime: string | null }> {
  const mime = params.blob.type || 'audio/webm';
  const path = recordingStoragePath(params.employeeId, params.callId, mime);
  try {
    await markCallRecordingStatus(params.callId, 'pending');
    const { error } = await supabase.storage.from(TELEMARKETING_RECORDINGS_BUCKET).upload(path, params.blob, {
      contentType: mime,
      upsert: false,
    });
    if (error) {
      await markCallRecordingStatus(params.callId, 'failed');
      return { status: 'failed', path: null, mime };
    }
    await markCallRecordingStatus(params.callId, 'ready', { path, mime });
    return { status: 'ready', path, mime };
  } catch {
    await markCallRecordingStatus(params.callId, 'failed');
    return { status: 'failed', path: null, mime };
  }
}

const signedUrlCache = new Map<string, { url: string; exp: number }>();

export async function createRecordingSignedUrl(path: string): Promise<string | null> {
  if (!path || path.startsWith('http')) return null;
  const now = Date.now();
  const hit = signedUrlCache.get(path);
  if (hit && hit.exp > now + 15_000) return hit.url;

  const { data, error } = await supabase.storage
    .from(TELEMARKETING_RECORDINGS_BUCKET)
    .createSignedUrl(path, RECORDING_SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(path, { url: data.signedUrl, exp: now + RECORDING_SIGNED_URL_TTL_SEC * 1000 });
  return data.signedUrl;
}
