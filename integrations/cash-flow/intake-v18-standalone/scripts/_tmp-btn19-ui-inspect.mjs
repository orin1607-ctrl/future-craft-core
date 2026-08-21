import { writeFileSync, mkdirSync } from 'node:fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../../../../scripts/google/_lib/auth.mjs';

const NEW = '1s3-gi5kusn2bl3HfiJT34Ig42n0sf7myQarohvtoAh9Im9c2Sdrc4qzG';
const DEP = 'AKfycbz2csN5kyFURg2MV08z70prtszZDXwXdoL8sXxslvO-35BNcRFeAaJpL3sYcZqmyr5f';

const auth = await getAuthenticatedClient();
const google = await loadGoogleAuthLibrary();
const api = google.script({ version: 'v1', auth });
const dep = await api.projects.deployments.get({ scriptId: NEW, deploymentId: DEP });
const content = (await api.projects.getContent({ scriptId: NEW })).data;
const index = content.files.find((f) => f.name === 'index');
if (!index) throw new Error('index missing');

mkdirSync('backups/button19-ui-simplify', { recursive: true });
writeFileSync('backups/button19-ui-simplify/index-before.html', index.source);

const src = index.source;
const cardStart = src.indexOf('root.innerHTML=(data.items||[]).map');
const cardEnd = cardStart >= 0 ? src.indexOf("}).join('');", cardStart) : -1;
const snip = cardStart >= 0 ? src.slice(cardStart, cardEnd + 20) : '';
writeFileSync('backups/button19-ui-simplify/card-render-before.js', snip);

const cssStart = src.indexOf('.v18c-card');
writeFileSync(
  'backups/button19-ui-simplify/v18c-css-before.css',
  cssStart >= 0 ? src.slice(cssStart, cssStart + 3500) : '',
);

console.log(
  JSON.stringify(
    {
      project: 'NEW v167 Clone',
      scriptId: NEW,
      deploymentId: DEP,
      ver: dep.data.deploymentConfig?.versionNumber,
      desc: dep.data.deploymentConfig?.description,
      indexLen: src.length,
      hasP20: src.includes('id="p20"'),
      hasCardMap: cardStart >= 0,
      cardSnipLen: snip.length,
      hasCurrent: src.includes('מצב נוכחי'),
      hasCompareFetch: src.includes('action=compareV18') || src.includes('compareV18ToNew'),
    },
    null,
    2,
  ),
);
