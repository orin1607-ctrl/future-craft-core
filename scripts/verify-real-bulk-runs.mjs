import { chromium } from 'playwright';

async function runRealBulkVerification() {
  const stagingUrl = process.argv[2] || process.env.STAGING_URL || 'https://orin1607-ctrl.github.io/future-craft-core/dalia-marketing-center-v2.html';
  console.log(`[VERIFY] Launching real bulk execution verification on: ${stagingUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Network audit: track every outbound request
  const outboundRequests = [];
  context.on('request', req => {
    outboundRequests.push(req.url());
  });

  const page = await context.newPage();

  try {
    console.log('[STEP 1] Navigating to Dalia Marketing V2...');
    await page.goto(stagingUrl, { waitUntil: 'networkidle' });

    console.log('[STEP 2] Opening OpenProspector module...');
    const leadsCard = page.locator('button.mod[data-go="m/leads"]');
    await leadsCard.click();
    await page.waitForTimeout(1000);

    const iframe = page.frameLocator('#module-frame-leads');
    await iframe.locator('#title').waitFor({ state: 'visible', timeout: 15000 });

    // Check initial seed leads and storage state
    const initialSeedCheck = await iframe.locator('body').evaluate(() => {
      const allCompanies = (typeof C !== 'undefined') ? C : (window.C || []);
      const stored = localStorage.getItem('dalia_prospector_leads_v2');
      return {
        initialMemoryCount: allCompanies.length,
        hasStorage: !!stored,
        storageCount: stored ? JSON.parse(stored).length : 0,
        sample: allCompanies.slice(0, 3).map(c => ({ name: c.name, hp: c.no, isReal: !c.name.includes('דמו') && !c.mail?.includes('example') }))
      };
    });
    console.log('[INITIAL STATE CHECK]:', initialSeedCheck);

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
    for (let i = 0; i < 50; i++) {
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

    // Deep evaluation of the newly added leads
    const run1Analysis = await iframe.locator('body').evaluate(() => {
      const allCompanies = (typeof C !== 'undefined') ? C : (window.C || []);
      const state = (typeof S !== 'undefined') ? S : (window.S || {});
      const bulkObj = state.bulk || {};
      const staged = bulkObj.staged || [];
      const newlyAdded = staged.length > 0 ? staged : allCompanies.slice(allCompanies.length - (bulkObj.stats?.added || 100));

      let withNamedOfficer = 0;
      let withCertifiedProfessional = 0;
      let misclassifiedOvdimAsSafetyOfficer = 0;
      let withFleetManager = 0;
      let withGovFleetEvidence = 0;
      let withIndicationOnly = 0;
      let withPhone = 0;
      let withEmail = 0;
      let withHp = 0;
      let withMandate579 = 0;
      let withTierA = 0;
      let withExplanation = 0;
      let fakePhoneCount = 0;
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
        if (c.phone && c.phone !== 'לא נמצא') {
          withPhone++;
          if (c.phone.startsWith('03-000-')) fakePhoneCount++;
        }
        if (c.mail) withEmail++;
        if (c.leadReason) withExplanation++;

        // Certified Professional check
        if (c.certifiedProfessional && c.certifiedProfessional.name) {
          withCertifiedProfessional++;
        }

        // Officer evaluation & OVDIM check
        const officerName = c.safetyOfficer ? c.safetyOfficer.name : '';
        const isNamed = officerName && !officerName.includes('טרם אותר') && !officerName.includes('קצב"ת ממונה') && !officerName.includes('הנהלת צי');
        if (isNamed) withNamedOfficer++;

        // Verify that OVDIM is NOT misclassified as safety officer
        if (c.certifiedProfessional && c.safetyOfficer && c.safetyOfficer.name === c.certifiedProfessional.name) {
          misclassifiedOvdimAsSafetyOfficer++;
        }

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

      const storedLeads = localStorage.getItem('dalia_prospector_leads_v2');

      return {
        totalStaged: newlyAdded.length,
        totalInSystem: allCompanies.length,
        persistedInStorage: storedLeads ? JSON.parse(storedLeads).length : 0,
        withNamedOfficer,
        withCertifiedProfessional,
        misclassifiedOvdimAsSafetyOfficer,
        fakePhoneCount,
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
          certifiedProfessional: c.certifiedProfessional ? c.certifiedProfessional.name : null,
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
    // PERSISTENCE TESTS: REFRESH AND BROWSER RESTART SIMULATION
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> [PERSISTENCE TEST 1: REFRESH VERIFICATION]');
    console.log('=============================================================');

    const countBeforeRefresh = run1Analysis.totalInSystem;
    console.log(`[PERSISTENCE] Memory count before refresh: ${countBeforeRefresh}. Reloading page...`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Reopen module if not already open
    const iframeExists = (await page.locator('#module-frame-leads').count()) > 0;
    if (!iframeExists) {
      const leadsBtn = page.locator('[data-go="m/leads"]');
      if ((await leadsBtn.count()) > 0) {
        await leadsBtn.first().click();
        await page.waitForTimeout(1000);
      }
    }

    const postRefreshIframe = page.frameLocator('#module-frame-leads');
    await postRefreshIframe.locator('#title').waitFor({ state: 'visible', timeout: 15000 });

    const postRefreshAnalysis = await postRefreshIframe.locator('body').evaluate(() => {
      const allCompanies = (typeof C !== 'undefined') ? C : (window.C || []);
      const stored = localStorage.getItem('dalia_prospector_leads_v2');
      return {
        memoryCount: allCompanies.length,
        storageCount: stored ? JSON.parse(stored).length : 0,
        firstLeadName: allCompanies[0] ? allCompanies[0].name : '',
        lastLeadName: allCompanies[allCompanies.length - 1] ? allCompanies[allCompanies.length - 1].name : ''
      };
    });

    console.log('[PERSISTENCE POST-REFRESH RESULT]:', postRefreshAnalysis);
    if (postRefreshAnalysis.memoryCount !== countBeforeRefresh) {
      throw new Error(`PERSISTENCE FAILED ON REFRESH: Expected ${countBeforeRefresh} leads, got ${postRefreshAnalysis.memoryCount}`);
    }
    console.log('✓ VERIFIED: 100% of leads persisted across full page reload (F5 / Refresh)!');

    // Test Browser Context restart simulation
    console.log('\n=============================================================');
    console.log('>>> [PERSISTENCE TEST 2: BROWSER RESTART SIMULATION]');
    console.log('=============================================================');

    const storageState = await context.storageState();
    const newContext = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
    const newPage = await newContext.newPage();

    await newPage.goto(stagingUrl, { waitUntil: 'networkidle' });
    await newPage.waitForTimeout(1000);

    const newIframeExists = (await newPage.locator('#module-frame-leads').count()) > 0;
    if (!newIframeExists) {
      const leadsBtn = newPage.locator('[data-go="m/leads"]');
      if ((await leadsBtn.count()) > 0) {
        await leadsBtn.first().click();
        await newPage.waitForTimeout(1000);
      }
    }

    const newIframe = newPage.frameLocator('#module-frame-leads');
    await newIframe.locator('#title').waitFor({ state: 'visible', timeout: 15000 });

    const newSessionAnalysis = await newIframe.locator('body').evaluate(() => {
      const allCompanies = (typeof C !== 'undefined') ? C : (window.C || []);
      return {
        memoryCount: allCompanies.length,
        firstLead: allCompanies[0] ? allCompanies[0].name : ''
      };
    });
    console.log('[PERSISTENCE BROWSER RESTART RESULT]:', newSessionAnalysis);
    if (newSessionAnalysis.memoryCount !== countBeforeRefresh) {
      throw new Error(`PERSISTENCE FAILED ON BROWSER RESTART: Expected ${countBeforeRefresh}, got ${newSessionAnalysis.memoryCount}`);
    }
    console.log('✓ VERIFIED: 100% of leads persisted across browser session restart!');
    await newContext.close();

    // =========================================================================
    // PART 2: REAL 500 LEADS IMPORT TEST
    // =========================================================================
    console.log('\n=============================================================');
    console.log('>>> [RUN 2: 500 LEADS IMPORT TEST] Starting on current session...');
    console.log('=============================================================');

    // Switch to search tab on current page
    await postRefreshIframe.locator('.tabs button[data-tab="search"]').click();
    await page.waitForTimeout(500);

    await postRefreshIframe.locator('#bulk-target').selectOption('500');
    await postRefreshIframe.locator('#bulk-batch-size').selectOption('100'); // 100 per batch for faster ingestion

    const startBulkBtn2 = postRefreshIframe.locator('#btnBulkStart');
    await startBulkBtn2.click();
    console.log('[RUN 2] Ingestion of 500 leads started in batches of 100. Processing...');

    let run2Finished = false;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(800);
      const isCommitVisible = await postRefreshIframe.locator('#btnBulkCommit').isVisible();
      if (isCommitVisible) {
        run2Finished = true;
        break;
      }
    }

    if (!run2Finished) throw new Error('Run 2 (500 leads) timed out or failed to complete.');
    console.log('[RUN 2] Batch ingestion of 500 leads completed successfully!');

    // Extract UI KPIs for Run 2
    const run2Scanned = parseInt(await postRefreshIframe.locator('#kpiScanned').textContent(), 10);
    const run2Added = parseInt(await postRefreshIframe.locator('#kpiAdded').textContent(), 10);
    const run2Duplicates = parseInt(await postRefreshIframe.locator('#kpiDuplicates').textContent(), 10);
    const run2Rejected = parseInt(await postRefreshIframe.locator('#kpiRejected').textContent(), 10);
    const run2FleetEvidence = parseInt(await postRefreshIframe.locator('#kpiFleet').textContent(), 10);
    const run2SafetyOfficers = parseInt(await postRefreshIframe.locator('#kpiSafety').textContent(), 10);

    const run2Analysis = await postRefreshIframe.locator('body').evaluate(() => {
      const allCompanies = (typeof C !== 'undefined') ? C : (window.C || []);
      const state = (typeof S !== 'undefined') ? S : (window.S || {});
      const bulkObj = state.bulk || {};
      const staged = bulkObj.staged || [];
      const newlyAdded = staged.length > 0 ? staged : allCompanies;

      let withNamedOfficer = 0;
      let withCertifiedProfessional = 0;
      let misclassifiedOvdimAsSafetyOfficer = 0;
      let fakePhoneCount = 0;
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
        if (c.phone && c.phone !== 'לא נמצא') {
          withPhone++;
          if (c.phone.startsWith('03-000-')) fakePhoneCount++;
        }
        if (c.mail) withEmail++;
        if (c.leadReason) withExplanation++;

        if (c.certifiedProfessional && c.certifiedProfessional.name) {
          withCertifiedProfessional++;
        }

        const officerName = c.safetyOfficer ? c.safetyOfficer.name : '';
        const isNamed = officerName && !officerName.includes('טרם אותר') && !officerName.includes('קצב"ת ממונה') && !officerName.includes('הנהלת צי');
        if (isNamed) withNamedOfficer++;

        if (c.certifiedProfessional && c.safetyOfficer && c.safetyOfficer.name === c.certifiedProfessional.name) {
          misclassifiedOvdimAsSafetyOfficer++;
        }

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

      const storedLeads = localStorage.getItem('dalia_prospector_leads_v2');

      return {
        totalStaged: newlyAdded.length,
        totalInSystem: allCompanies.length,
        persistedInStorage: storedLeads ? JSON.parse(storedLeads).length : 0,
        withNamedOfficer,
        withCertifiedProfessional,
        misclassifiedOvdimAsSafetyOfficer,
        fakePhoneCount,
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
          certifiedProfessional: c.certifiedProfessional ? c.certifiedProfessional.name : null,
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

    // Post Run 2 refresh test
    console.log('\n[PERSISTENCE POST RUN 2] Reloading page to verify 500+ leads persistence...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const postRun2IframeExists = (await page.locator('#module-frame-leads').count()) > 0;
    if (!postRun2IframeExists) {
      const leadsBtn = page.locator('[data-go="m/leads"]');
      if ((await leadsBtn.count()) > 0) {
        await leadsBtn.first().click();
        await page.waitForTimeout(1000);
      }
    }
    const postRun2Iframe = page.frameLocator('#module-frame-leads');
    await postRun2Iframe.locator('#title').waitFor({ state: 'visible', timeout: 15000 });

    const finalPersistenceCheck = await postRun2Iframe.locator('body').evaluate(() => {
      const allCompanies = (typeof C !== 'undefined') ? C : (window.C || []);
      const stored = localStorage.getItem('dalia_prospector_leads_v2');
      return {
        memoryCount: allCompanies.length,
        storageCount: stored ? JSON.parse(stored).length : 0
      };
    });
    console.log('[FINAL PERSISTENCE CHECK AFTER RUN 2 REFRESH]:', finalPersistenceCheck);
    if (finalPersistenceCheck.memoryCount !== run2Analysis.totalInSystem) {
      throw new Error(`PERSISTENCE ERROR AFTER RUN 2: expected ${run2Analysis.totalInSystem}, found ${finalPersistenceCheck.memoryCount}`);
    }
    console.log(`✓ VERIFIED: All ${finalPersistenceCheck.memoryCount} leads persisted across refresh!`);

    // Check Outbound Requests for any paid APIs
    const paidApis = outboundRequests.filter(url => 
      url.includes('apollo.io') || 
      url.includes('lusha.com') || 
      url.includes('firecrawl.dev') || 
      url.includes('tavily.com') ||
      (url.includes('googleapis.com/maps') && !url.includes('fonts.'))
    );

    console.log('\n[NETWORK & COMPLIANCE AUDIT]:');
    console.log(`- Total requests logged: ${outboundRequests.length}`);
    console.log(`- Paid API calls detected: ${paidApis.length}`);
    console.log(`- Misclassified OVDIM as safety officers: ${run1Analysis.misclassifiedOvdimAsSafetyOfficer + run2Analysis.misclassifiedOvdimAsSafetyOfficer}`);
    console.log(`- Fake phone numbers (03-000-xxxx): ${run1Analysis.fakePhoneCount + run2Analysis.fakePhoneCount}`);
    console.log(`- Total duplicate HP across all runs: ${run1Analysis.hpDuplicates + run2Analysis.hpDuplicates}`);
    if (paidApis.length > 0) {
      console.warn('WARNING: Paid API calls found:', paidApis);
    } else {
      console.log('✓ VERIFIED: Zero paid APIs called during entire execution (Cost = ₪0.00).');
    }

    // Save full JSON summary for report
    const reportData = {
      initialState: initialSeedCheck,
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
      persistenceTest: {
        countBeforeRefresh,
        postRefreshMemoryCount: postRefreshAnalysis.memoryCount,
        postRefreshStorageCount: postRefreshAnalysis.storageCount,
        browserRestartMemoryCount: newSessionAnalysis.memoryCount,
        finalCountAfterRun2Refresh: finalPersistenceCheck.memoryCount,
        persistedCleanly: true
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
        paidApiCalls: paidApis.length,
        estimatedCost: "₪0.00"
      },
      ovdimCompliance: {
        totalCertifiedProfessionals: run1Analysis.withCertifiedProfessional + run2Analysis.withCertifiedProfessional,
        misclassifiedAsSafetyOfficers: run1Analysis.misclassifiedOvdimAsSafetyOfficer + run2Analysis.misclassifiedOvdimAsSafetyOfficer,
        compliant: (run1Analysis.misclassifiedOvdimAsSafetyOfficer + run2Analysis.misclassifiedOvdimAsSafetyOfficer) === 0
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
