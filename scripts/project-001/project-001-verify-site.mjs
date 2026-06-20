import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';
import { loadP001Config, P001 } from './_lib/config.mjs';

const INDEX_HTML = join(P001.root, 'index.html');
const PUBLIC_DIR = join(P001.root, 'public');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function injectMeta(html, token) {
  const tag = `<meta name="google-site-verification" content="${token}" />`;
  if (html.includes('google-site-verification')) {
    return html.replace(/<meta name="google-site-verification" content="[^"]*"\s*\/?>/, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

async function main() {
  const cfg = loadP001Config();
  const siteUrl = cfg.gsc_site_url.endsWith('/') ? cfg.gsc_site_url : `${cfg.gsc_site_url}/`;
  const auth = await getAuthenticatedClient({ scopes: getP001Scopes() });
  const google = await loadGoogleAuthLibrary();
  const sv = google.siteVerification({ version: 'v1', auth });
  const sc = google.searchconsole({ version: 'v1', auth });
  const report = { siteUrl, timestamp: new Date().toISOString() };

  // META tag
  try {
    const meta = await sv.webResource.getToken({
      requestBody: { verificationMethod: 'META', site: { type: 'SITE', identifier: siteUrl } },
    });
    const html = readFileSync(INDEX_HTML, 'utf8');
    writeFileSync(INDEX_HTML, injectMeta(html, meta.data.token));
    report.meta_token_added = true;
    console.log('META tag added to index.html');
  } catch (e) {
    report.meta_error = e.message?.slice(0, 200);
    console.warn('META:', report.meta_error);
  }

  // FILE method (public/google*.html)
  try {
    const file = await sv.webResource.getToken({
      requestBody: { verificationMethod: 'FILE', site: { type: 'SITE', identifier: siteUrl } },
    });
    const filename = file.data.token;
    mkdirSync(PUBLIC_DIR, { recursive: true });
    writeFileSync(join(PUBLIC_DIR, filename), `google-site-verification: ${filename}`);
    report.verification_file = `public/${filename}`;
    console.log('Verification file:', report.verification_file);
  } catch (e) {
    report.file_error = e.message?.slice(0, 200);
    console.warn('FILE:', report.file_error);
  }

  for (const method of ['META', 'FILE']) {
    try {
      await sv.webResource.insert({
        verificationMethod: method,
        requestBody: { site: { type: 'SITE', identifier: siteUrl } },
      });
      report.verified = true;
      report.verification_method = method;
      console.log(`Site verified via ${method}!`);
      break;
    } catch (e) {
      report[`verify_${method.toLowerCase()}`] = e.message?.slice(0, 120);
    }
  }

  const sites = await sc.sites.list();
  report.gsc_sites = (sites.data.siteEntry || []).map((s) => ({
    url: s.siteUrl,
    level: s.permissionLevel,
  }));

  mkdirSync(P001.auditOut, { recursive: true });
  writeFileSync(`${P001.auditOut}/verification.json`, JSON.stringify(report, null, 2));
  console.log('\nReport:', `${P001.auditOut}/verification.json`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
