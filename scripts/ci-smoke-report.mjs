/**
 * CI smoke checks — build artifact verification + live URL probes.
 * Usage: node scripts/ci-smoke-report.mjs --base https://preview.dalia-car.online --supabase-ref qasomfndnjuixgjmjwcm
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const base = (arg('--base') || '').replace(/\/$/, '');
const distDir = arg('--dist', 'dist');
const supabaseRef = arg('--supabase-ref', 'qasomfndnjuixgjmjwcm');
const forbidRef = arg('--forbid-ref', 'usfeoerkpcafxxlyuldl');
const outPath = arg('--out', '');

const ROUTES = [
  '/login',
  '/dashboard',
  '/dalia-settings',
  '/transport',
  '/fleet-managers',
  '/vehicles',
  '/drivers',
];

const report = {
  at: new Date().toISOString(),
  base: base || null,
  dist: distDir,
  checks: {},
  passed: true,
  failures: [],
};

function fail(key, msg) {
  report.checks[key] = { ok: false, error: msg };
  report.passed = false;
  report.failures.push(`${key}: ${msg}`);
}

function pass(key, detail = {}) {
  report.checks[key] = { ok: true, ...detail };
}

// --- Dist / build checks ---
if (existsSync(join(distDir, 'index.html'))) {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const bundleMatch = html.match(/index-[^"']+\.js/);
  if (!bundleMatch) fail('build_bundle', 'No index-*.js in dist/index.html');
  else pass('build_bundle', { bundle: bundleMatch[0] });

  if (html.includes('/future-craft-core/')) {
    fail('build_base_path', 'GitHub Pages base path found — wrong for production/preview root');
  } else {
    pass('build_base_path');
  }

  if (bundleMatch) {
    const jsPath = join(distDir, 'assets', bundleMatch[0].replace(/^\//, '').replace(/^assets\//, ''));
    const assetFile = bundleMatch[0].includes('assets/')
      ? join(distDir, bundleMatch[0].replace(/^\//, ''))
      : join(distDir, 'assets', bundleMatch[0]);
    const jsFile = existsSync(assetFile) ? assetFile : jsPath;
    if (existsSync(jsFile)) {
      const js = readFileSync(jsFile, 'utf8');
      if (!js.includes(supabaseRef)) fail('build_supabase', `Missing production ref ${supabaseRef}`);
      else pass('build_supabase', { ref: supabaseRef });
      if (js.includes(forbidRef)) fail('build_staging_leak', `Staging ref ${forbidRef} in bundle`);
      else pass('build_staging_leak');
      report.production_bundle = bundleMatch[0];
    } else {
      fail('build_assets', `Bundle file missing: ${jsFile}`);
    }
  }
} else if (!base) {
  fail('build_dist', `Missing ${distDir}/index.html`);
}

// --- Live URL checks ---
if (base) {
  try {
    const res = await fetch(`${base}/`, { redirect: 'follow' });
    const html = await res.text();
    if (!res.ok) fail('live_http', `GET / → ${res.status}`);
    else pass('live_http', { status: res.status });

    const bundle = html.match(/index-[^"']+\.js/)?.[0];
    if (!bundle) fail('live_bundle', 'No bundle in live HTML');
    else pass('live_bundle', { bundle });

    if (!html.includes('id="root"')) fail('live_spa', 'Missing SPA root');
    else pass('live_spa');

    for (const route of ROUTES) {
      try {
        const r = await fetch(`${base}${route}`, { redirect: 'manual' });
        const ok = r.status === 200 || r.status === 304;
        report.checks[`route_${route}`] = { ok, status: r.status };
        if (!ok && r.status !== 301 && r.status !== 302) {
          report.passed = false;
          report.failures.push(`route ${route}: HTTP ${r.status}`);
        }
      } catch (e) {
        report.checks[`route_${route}`] = { ok: false, error: e.message };
        report.passed = false;
        report.failures.push(`route ${route}: ${e.message}`);
      }
    }
    pass('routes_checked', { count: ROUTES.length });

    const otpProbe = await fetch(
      `https://${supabaseRef}.supabase.co/functions/v1/auth-verify-otp`,
      { method: 'OPTIONS' },
    );
    if (otpProbe.status !== 200 && otpProbe.status !== 204) {
      fail('supabase_otp_edge', `OPTIONS auth-verify-otp → ${otpProbe.status}`);
    } else {
      pass('supabase_otp_edge');
    }
  } catch (e) {
    fail('live_fetch', e.message);
  }
}

const json = JSON.stringify(report, null, 2);
if (outPath) {
  const { writeFileSync, mkdirSync } = await import('fs');
  mkdirSync(join(outPath, '..'), { recursive: true });
  writeFileSync(outPath, json);
}
console.log(json);
process.exit(report.passed ? 0 : 1);
