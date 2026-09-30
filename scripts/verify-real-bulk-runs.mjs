import { chromium } from 'playwright';

async function runRealBulkVerification() {
  const stagingUrl = 'https://orin1607-ctrl.github.io/future-craft-core/dalia-marketing-center-v2.html';
  console.log(`[VERIFY] Launching real bulk execution verification on live staging: ${stagingUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Network audit: track every outbound request
  const outboundRequests = [];
  context.on('request', req => {
    outboundRequests.push(req.url());
  });

  const page = await context.newPage();

  try {
    console.log('[STEP 1] Navigating to Dalia Marketing V2 staging...');
    await page.goto(stagingUrl, { waitUntil: 'networkidle' });

    console.log('[STEP 2] Opening OpenProspector module...');
    const leadsCard = page.locator('button.mod[data-go="m/leads"]');
    await leadsCard.click();
    await page.waitForTimeout(1000);

    const iframe = page.frameLocator('#module-frame-leads');
    await iframe.locator('#title').waitFor({ state: 'visible', timeout: 10000 });

    // Open Search Tab
    const searchTab = iframe.locator('.tabs button[data-tab="search"]');
    await searchTab.click();
    await page.waitForTimeout(500);

    // =========================================================================
    // PART 1: REAL 100 LEADS IMPORT (קצין רכב / קצין בטיחות)
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> [RUN 1: 100 LEADS IMPORT TEST] Starting...');
    console.log('=============================================================');

    await iframe.locator('#bulk-target').selectOption('100');
    await iframe.locator('#bulk-source').selectOption('contractors_infra'); // פנקס הקבלנים ענף 200 (תשתית, עפר, צמ"ה וקצב"ת)
    await iframe.locator('#bulk-batch-size').selectOption('50');

    const startBulkBtn = iframe.locator('#btnBulkStart');
    await startBulkBtn.click();
    console.log('[RUN 1] Bulk Ingestion started. Waiting for batch processing...');

    // Wait until completion
    let run1Finished = false;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(600);
      const isCommitVisible = await iframe.locator('#btnBulkCommit').isVisible();
      if (isCommitVisible) {
        run1Finished = true;
        break;
      }
    }

    if (!run1Finished) throw new Error('Run 1 (100 leads) timed out or failed to complete.');
    console.log('[RUN 1] Batch ingestion completed successfully!');

    // Extract UI KPIs
    const run1Scanned = parseInt(await iframe.locator('#kpiScanned').textContent(), 10);
    const run1Added = parseInt(await iframe.locator('#kpiAdded').textContent(), 10);
    const run1Duplicates = parseInt(await iframe.locator('#kpiDuplicates').textContent(), 10);
    const run1Rejected = parseInt(await iframe.locator('#kpiRejected').textContent(), 10);
    const run1FleetEvidence = parseInt(await iframe.locator('#kpiFleet').textContent(), 10);
    const run1SafetyOfficers = parseInt(await iframe.locator('#kpiSafety').textContent(), 10);

    // Evaluate in-memory data for deep audit of the 100 leads
    const run1Analysis = await iframe.locator('body').evaluate(() => {
      // Access S and C from window scope
      const allCompanies = (typeof C !== 'undefined') ? C : (window.C || []);
      const state = (typeof S !== 'undefined') ? S : (window.S || {});
      const bulkObj = state.bulk || {};
      const staged = bulkObj.staged || [];
      const newlyAdded = staged.length > 0 ? staged : allCompanies.slice(allCompanies.length - (bulkObj.stats?.added || 100));

      let withNamedOfficer = 0;
      let withFleetManager = 0;
      let withGovFleetEvidence = 0;
      let withIndicationOnly = 0;
      let withPhone = 0;
      let withEmail = 0;
      let withHp = 0;
      let withMandate579 = 0;
      let withTierA = 0;
      let withExplanation = 0;
      let statusNew = 0;
      let statusCrm = 0;

      const seenHp = new Set();
      let hpDuplicates = 0;

      newlyAdded.forEach(c => {
        if (c.no) {
          if (seenHp.has(c.no)) hpDuplicates++;
          seenHp.add(c.no);
          withHp++;
        }
        if (c.phone && c.phone !== 'לא נמצא') withPhone++;
        if (c.mail) withEmail++;
        if (c.leadReason) withExplanation++;

        // Officer evaluation
        const officerName = c.safetyOfficer ? c.safetyOfficer.name : '';
        const isNamed = officerName && !officerName.includes('קצב"ת ממונה') && !officerName.includes('הנהלת צי');
        if (isNamed) withNamedOfficer++;

        // Fleet manager
        if (c.people && c.people.some(p => p[1] && (p[1].includes('מנהל צי') || p[1].includes('תפעול') || p[1].includes('ציוד')))) {
          withFleetManager++;
        }

        // Gov evidence vs indication
        const hasGovEv = c.ev && c.ev.some(e => e[6] === 'A' || e[1].includes('data.gov.il') || e[1].includes('פנקס') || e[1].includes('משרד התחבורה'));
        if (hasGovEv) withGovFleetEvidence++;
        else withIndicationOnly++;

        if (c.safetyOfficer && c.safetyOfficer.mandate579) withMandate579++;
        if (c.safetyOfficer && c.safetyOfficer.tier === 'A') withTierA++;

        if (c.status === 'new') statusNew++;
        else statusCrm++;
      });

      return {
        totalStaged: newlyAdded.length,
        withNamedOfficer,
        withFleetManager,
        withGovFleetEvidence,
        withIndicationOnly,
        withPhone,
        withEmail,
        withHp,
        withMandate579,
        withTierA,
        withExplanation,
        statusNew,
        statusCrm,
        hpDuplicates,
        sampleLeads: newlyAdded.slice(0, 5).map(c => ({
          name: c.name,
          hp: c.no,
          phone: c.phone,
          mail: c.mail,
          branch: c.ind,
          fleetType: c.fleetType,
          officerName: c.safetyOfficer ? c.safetyOfficer.name : '—',
          officerRole: c.safetyOfficer ? c.safetyOfficer.role : '—',
          tier: c.safetyOfficer ? c.safetyOfficer.tier : '—',
          mandate579: c.safetyOfficer ? c.safetyOfficer.mandate579 : false,
          leadReason: c.leadReason
        }))
      };
    });

    console.log('[RUN 1 RESULTS]:', {
      run1Scanned,
      run1Added,
      run1Duplicates,
      run1Rejected,
      run1FleetEvidence,
      run1SafetyOfficers,
      ...run1Analysis
    });

    // =========================================================================
    // PART 2: REAL 500 LEADS IMPORT TEST
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> [RUN 2: 500 LEADS IMPORT TEST] Starting...');
    console.log('=============================================================');

    await iframe.locator('#bulk-target').selectOption('500');
    await iframe.locator('#bulk-batch-size').selectOption('100'); // 100 per batch for faster ingestion

    // Start 500 leads import
    await startBulkBtn.click();
    console.log('[RUN 2] Ingestion of 500 leads started in batches of 100. Processing...');

    let run2Finished = false;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(800);
      const isCommitVisible = await iframe.locator('#btnBulkCommit').isVisible();
      if (isCommitVisible) {
        run2Finished = true;
        break;
      }
    }

    if (!run2Finished) throw new Error('Run 2 (500 leads) timed out or failed to complete.');
    console.log('[RUN 2] Batch ingestion of 500 leads completed successfully!');

    // Extract UI KPIs for Run 2
    const run2Scanned = parseInt(await iframe.locator('#kpiScanned').textContent(), 10);
    const run2Added = parseInt(await iframe.locator('#kpiAdded').textContent(), 10);
    const run2Duplicates = parseInt(await iframe.locator('#kpiDuplicates').textContent(), 10);
    const run2Rejected = parseInt(await iframe.locator('#kpiRejected').textContent(), 10);
    const run2FleetEvidence = parseInt(await iframe.locator('#kpiFleet').textContent(), 10);
    const run2SafetyOfficers = parseInt(await iframe.locator('#kpiSafety').textContent(), 10);

    const run2Analysis = await iframe.locator('body').evaluate(() => {
      const allCompanies = (typeof C !== 'undefined') ? C : (window.C || []);
      const state = (typeof S !== 'undefined') ? S : (window.S || {});
      const bulkObj = state.bulk || {};
      const staged = bulkObj.staged || [];
      const newlyAdded = staged.length > 0 ? staged : allCompanies;

      let withNamedOfficer = 0;
      let withFleetManager = 0;
      let withGovFleetEvidence = 0;
      let withIndicationOnly = 0;
      let withPhone = 0;
      let withEmail = 0;
      let withHp = 0;
      let withMandate579 = 0;
      let withTierA = 0;
      let withExplanation = 0;
      let statusNew = 0;
      let statusCrm = 0;

      const seenHp = new Set();
      let hpDuplicates = 0;

      newlyAdded.forEach(c => {
        if (c.no) {
          if (seenHp.has(c.no)) hpDuplicates++;
          seenHp.add(c.no);
          withHp++;
        }
        if (c.phone && c.phone !== 'לא נמצא') withPhone++;
        if (c.mail) withEmail++;
        if (c.leadReason) withExplanation++;

        const officerName = c.safetyOfficer ? c.safetyOfficer.name : '';
        const isNamed = officerName && !officerName.includes('קצב"ת ממונה') && !officerName.includes('הנהלת צי');
        if (isNamed) withNamedOfficer++;

        if (c.people && c.people.some(p => p[1] && (p[1].includes('מנהל צי') || p[1].includes('תפעול') || p[1].includes('ציוד')))) {
          withFleetManager++;
        }

        const hasGovEv = c.ev && c.ev.some(e => e[6] === 'A' || e[1].includes('data.gov.il') || e[1].includes('פנקס') || e[1].includes('משרד התחבורה'));
        if (hasGovEv) withGovFleetEvidence++;
        else withIndicationOnly++;

        if (c.safetyOfficer && c.safetyOfficer.mandate579) withMandate579++;
        if (c.safetyOfficer && c.safetyOfficer.tier === 'A') withTierA++;

        if (c.status === 'new') statusNew++;
        else statusCrm++;
      });

      return {
        totalStaged: newlyAdded.length,
        totalInSystem: allCompanies.length,
        withNamedOfficer,
        withFleetManager,
        withGovFleetEvidence,
        withIndicationOnly,
        withPhone,
        withEmail,
        withHp,
        withMandate579,
        withTierA,
        withExplanation,
        statusNew,
        statusCrm,
        hpDuplicates,
        sampleLeads: newlyAdded.slice(0, 5).map(c => ({
          name: c.name,
          hp: c.no,
          phone: c.phone,
          mail: c.mail,
          branch: c.ind,
          fleetType: c.fleetType,
          officerName: c.safetyOfficer ? c.safetyOfficer.name : '—',
          officerRole: c.safetyOfficer ? c.safetyOfficer.role : '—',
          tier: c.safetyOfficer ? c.safetyOfficer.tier : '—',
          mandate579: c.safetyOfficer ? c.safetyOfficer.mandate579 : false,
          leadReason: c.leadReason
        }))
      };
    });

    console.log('[RUN 2 RESULTS]:', {
      run2Scanned,
      run2Added,
      run2Duplicates,
      run2Rejected,
      run2FleetEvidence,
      run2SafetyOfficers,
      ...run2Analysis
    });

    // Check Outbound Requests for any paid APIs
    const paidApis = outboundRequests.filter(url => 
      url.includes('apollo.io') || 
      url.includes('lusha.com') || 
      url.includes('firecrawl.dev') || 
      url.includes('tavily.com') ||
      (url.includes('googleapis.com/maps') && !url.includes('fonts.'))
    );

    console.log('\n[NETWORK AUDIT]:');
    console.log(`- Total requests logged: ${outboundRequests.length}`);
    console.log(`- Paid API calls detected: ${paidApis.length}`);
    if (paidApis.length > 0) {
      console.warn('WARNING: Paid API calls found:', paidApis);
    } else {
      console.log('✓ VERIFIED: Zero paid APIs called during entire execution.');
    }

    // Save full JSON summary for report
    const reportData = {
      run1: {
        target: 100,
        scanned: run1Scanned,
        added: run1Added,
        duplicates: run1Duplicates,
        rejected: run1Rejected,
        fleetEvidence: run1FleetEvidence,
        safetyOfficers: run1SafetyOfficers,
        analysis: run1Analysis
      },
      run2: {
        target: 500,
        scanned: run2Scanned,
        added: run2Added,
        duplicates: run2Duplicates,
        rejected: run2Rejected,
        fleetEvidence: run2FleetEvidence,
        safetyOfficers: run2SafetyOfficers,
        analysis: run2Analysis
      },
      networkAudit: {
        totalRequests: outboundRequests.length,
        paidApiCalls: paidApis.length
      }
    };

    console.log('\n[FINAL JSON REPORT]:\n' + JSON.stringify(reportData, null, 2));

  } catch (err) {
    console.error('[ERROR during verification]', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runRealBulkVerification();
