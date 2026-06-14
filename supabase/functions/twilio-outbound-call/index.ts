import { edgeCorsHeaders, requireAuth } from '../_shared/edgeAuth.ts';

const corsHeaders = edgeCorsHeaders;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req, { roles: ['super_admin', 'fleet_manager'] });
    if ('error' in auth) return auth.error;

    const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const FROM_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');
    const ELEVENLABS_AGENT_PHONE_NUMBER_ID = Deno.env.get('ELEVENLABS_AGENT_PHONE_NUMBER_ID');
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

    if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER) {
      return new Response(
        JSON.stringify({ error: 'Twilio credentials are not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { to, agentId, message, useAgent, dynamicVariables } = body;

    if (!to || typeof to !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Phone number (to) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let normalizedTo = to.replace(/[\s-]/g, '');
    if (normalizedTo.startsWith('0')) {
      normalizedTo = '+972' + normalizedTo.slice(1);
    } else if (!normalizedTo.startsWith('+')) {
      normalizedTo = '+' + normalizedTo;
    }

    // ===== Path A: Use ElevenLabs native Twilio integration =====
    if (useAgent && ELEVENLABS_AGENT_ID && ELEVENLABS_AGENT_PHONE_NUMBER_ID && ELEVENLABS_API_KEY) {
      const elevenRes = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: agentId || ELEVENLABS_AGENT_ID,
          agent_phone_number_id: ELEVENLABS_AGENT_PHONE_NUMBER_ID,
          to_number: normalizedTo,
          conversation_initiation_client_data: dynamicVariables ? {
            dynamic_variables: dynamicVariables,
          } : undefined,
        }),
      });
      const elevenData = await elevenRes.json();
      if (!elevenRes.ok) {
        console.error('ElevenLabs outbound call error:', elevenData);
        return new Response(
          JSON.stringify({ error: 'ElevenLabs call failed', details: elevenData }),
          { status: elevenRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, mode: 'elevenlabs_agent', ...elevenData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== Path B: Fallback - simple TwiML message via Twilio =====
    const escapeXml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    const safeMsg = escapeXml(message || 'שלום, זוהי שיחת בדיקה ממערכת ניהול הצי');
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="he-IL" voice="Google.he-IL-Standard-A">${safeMsg}</Say>
</Response>`;

    const twilioBasicAuth = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`);
    const formData = new URLSearchParams({
      To: normalizedTo,
      From: FROM_NUMBER,
      Twiml: twiml,
    });

    const twRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${twilioBasicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    const data = await twRes.json();

    if (!twRes.ok) {
      console.error('Twilio error:', twRes.status, data);
      return new Response(
        JSON.stringify({ error: 'Twilio call failed', details: data }),
        { status: twRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'twiml_say',
        callSid: data.sid,
        status: data.status,
        to: normalizedTo,
        from: FROM_NUMBER,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('Unexpected error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
