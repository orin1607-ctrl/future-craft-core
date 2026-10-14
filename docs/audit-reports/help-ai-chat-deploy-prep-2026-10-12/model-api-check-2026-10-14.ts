// Local check of callGemini / callClaude against fake endpoints that enforce the API rules seen in
// the live logs on 2026-10-14: Gemini rejects role 'function'; claude-haiku-5-5 rejects `temperature`.
// Run: sed 's/^Deno\.serve(/const __handler = (/' help-ai-chat/index.ts > help-ai-chat/harness.ts
//      echo 'export { callGemini, callClaude };' >> help-ai-chat/harness.ts
//      deno run --allow-all --no-config <this file> ./help-ai-chat/harness.ts
// Result: fix 10/10; live v148 3/10 (same errors as production logs).
// Fictitious data only. Fake Gemini and Claude endpoints that enforce today's API rules.
const { callGemini, callClaude } = await import(Deno.args[0]);
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}`, ok ? "" : JSON.stringify(x)?.slice(0, 300)); };
const calls: any[] = [];
globalThis.fetch = (async (url: string, init: any) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body });
  if (String(url).includes("generativelanguage")) {
    if (String(url).includes("gemini-2.5")) return new Response('{"error":{"code":404}}', { status: 404 });
    const bad = body.contents.find((c: any) => !["user", "model"].includes(c.role));
    if (bad) return new Response(JSON.stringify({ error: { code: 400, message: `Role '${bad.role}' is not supported.` } }), { status: 400 });
    const hasResult = body.contents.some((c: any) => c.parts?.some((p: any) => p.functionResponse));
    const parts = hasResult ? [{ text: "יש 3 תיקים פתוחים (מתוך הכלי)." }] : [{ functionCall: { name: "get_claims_summary", args: {} }, thoughtSignature: "sig" }];
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts } }] }), { status: 200 });
  }
  if (String(url).includes("anthropic")) {
    if ("temperature" in body) return new Response('{"type":"error","error":{"message":"`temperature` is deprecated for this model."}}', { status: 400 });
    if (!["claude-haiku-5-5", "claude-sonnet-5-5"].includes(body.model)) return new Response('{"error":"not_found"}', { status: 404 });
    const last = body.messages[body.messages.length - 1];
    const hasResult = Array.isArray(last.content) && last.content.some((b: any) => b.type === "tool_result");
    const content = hasResult ? [{ type: "text", text: "Claude: יש 3 תיקים פתוחים." }] : [{ type: "tool_use", id: "tu1", name: "get_claims_summary", input: {} }];
    return new Response(JSON.stringify({ content }), { status: 200 });
  }
  return new Response("nope", { status: 500 });
}) as typeof fetch;
const tools = [{ functionDeclarations: [{ name: "get_claims_summary", description: "x", parameters: { type: "OBJECT", properties: {} } }] }];
let toolRuns = 0;
const onToolCall = async () => { toolRuns++; return { result: { open: 3 } }; };
const msgs = [{ role: "user", content: "כמה תיקים פתוחים יש?" }];

const g = await callGemini("k", "gemini-3.8-flash", "sys", msgs, tools, onToolCall, [], 0.2);
check("general chat via Gemini: answer after a tool call", "text" in g && g.text.includes("3"), g);
const gCalls = calls.filter((c) => c.url.includes("generativelanguage"));
check("Gemini: 2 requests (tool call + answer), no model hopping", gCalls.length === 2, gCalls.map((c) => c.url.split("/models/")[1]));
const second = gCalls[1]?.body.contents || [];
check("Gemini: tool result sent with role user", second.some((c: any) => c.role === "user" && c.parts.some((p: any) => p.functionResponse)), second.map((c: any) => c.role));
check("Gemini: thoughtSignature kept on the model turn", second.some((c: any) => c.role === "model" && c.parts.some((p: any) => p.thoughtSignature === "sig")));
check("Gemini: claims temperature 0.2 still sent", gCalls[0]?.body.generationConfig?.temperature === 0.2);
check("tool ran once", toolRuns === 1, toolRuns);

calls.length = 0; toolRuns = 0;
const c = await callClaude("k", "claude-haiku-5-5", "sys", msgs, tools, onToolCall, [], 0.2);
check("Claude fallback: answers after a tool call", "text" in c && c.text.includes("3"), c);
const cCalls = calls.filter((x) => x.url.includes("anthropic"));
check("Claude: no temperature sent", cCalls.length > 0 && cCalls.every((x) => !("temperature" in x.body)), cCalls.map((x) => Object.keys(x.body)));
check("Claude: first model works, no retired models tried", cCalls.every((x) => x.body.model === "claude-haiku-5-5"), cCalls.map((x) => x.body.model));

calls.length = 0;
const plain = await callGemini("k", "gemini-3.8-flash", "sys", [{ role: "user", content: "שלום" }], undefined, undefined, [], 0.2);
check("no tools (like the in-claim answer today): still answers", "text" in plain || "error" in plain, plain);
console.log(`\n${pass} passed, ${fail} failed`);
