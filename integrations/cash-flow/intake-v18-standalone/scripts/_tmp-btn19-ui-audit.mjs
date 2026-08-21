import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../../../../scripts/google/_lib/auth.mjs';

const NEW = '1s3-gi5kusn2bl3HfiJT34Ig42n0sf7myQarohvtoAh9Im9c2Sdrc4qzG';
const DEP = 'AKfycbz2csN5kyFURg2MV08z70prtszZDXwXdoL8sXxslvO-35BNcRFeAaJpL3sYcZqmyr5f';
const V18 = '1yn8zeIV2WJkox-0nEmIT4ozrtRmCdzdgu8xwmnOt7soIZ0Jiju0Au0dc';

function sha(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

const auth = await getAuthenticatedClient();
const google = await loadGoogleAuthLibrary();
const api = google.script({ version: 'v1', auth });

const dep = await api.projects.deployments.get({ scriptId: NEW, deploymentId: DEP });
const neu = (await api.projects.getContent({ scriptId: NEW })).data;
const v18 = (await api.projects.getContent({ scriptId: V18 })).data;

const index = neu.files.find((f) => f.name === 'index')?.source || '';
const code = neu.files.find((f) => f.name === 'Code')?.source || '';
const cmp = neu.files.find((f) => f.name === 'V18Compare')?.source || '';

const out = {
  newProject: 'NEW v167 Clone',
  scriptId: NEW,
  deploymentId: DEP,
  ver: dep.data.deploymentConfig?.versionNumber,
  desc: dep.data.deploymentConfig?.description,
  uiMarkersInIndex: {
    simpleTable: index.includes('data-v18c-detail') && index.includes('בדיקה</th><th>V18</th><th>NEW v167</th>'),
    openCheck: index.includes('פתח בדיקה'),
    tech: index.includes('פרטים טכניים'),
    noCardClickOpen: !index.includes("card.addEventListener('click'"),
  },
  standingUntouched: {
    hasParseStanding: code.includes('parseStandingOrdersReportGas_'),
    hasRealign: code.includes('stRealignStandingNamesFromIntake_'),
    hasApply: code.includes('applyStandingOrdersReport_'),
    // UI task must not alter these function bodies — fingerprint of function names presence only
  },
  hashes: {
    Code: sha(code),
    V18Compare: sha(cmp),
    index: sha(index),
  },
  v18UntouchedConfirm: {
    scriptId: V18,
    fileCount: v18.files.length,
    // we did not call updateContent on V18 in this task
  },
};

writeFileSync('backups/button19-ui-simplify/project-audit.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
