async function run() {
  const token = 'f12ddc5ea119e1eab41497e2e7bf9c4670427f4805e49bf4b315d8a0c29f994e';
  const res = await fetch('https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/claims-docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'public_share_get', token })
  });
  const data = await res.json();
  console.log('Verification result:', {
    status: res.status,
    success: data.success,
    recipient: data.recipient_name,
    claim_id: data.claim_id,
    filesCount: data.files?.length,
    sampleFile: data.files?.[0]
  });
}
run().catch(console.error);
