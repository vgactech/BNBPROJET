/** Optional browser regression. Uses an existing Playwright installation; no dependency added. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.BNB_UI_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true, ...(process.env.BNB_UI_BROWSER_EXECUTABLE ? { executablePath: process.env.BNB_UI_BROWSER_EXECUTABLE } : {}), args: ['--disable-dev-shm-usage'] });
const exactAmount = amount => {
  const unit = 10n ** 18n;
  const decimal = (amount % unit).toString().padStart(18, '0').replace(/0+$/, '');
  return `${amount / unit}${decimal ? '.' + decimal : ''} tBNB`;
};
const paidTotal = reports => reports.reduce((sum, report) => sum + (report.rewardState === 'paid' && typeof report.rewardAmountWei === 'string' && /^[0-9]{1,78}$/.test(report.rewardAmountWei) ? BigInt(report.rewardAmountWei) : 0n), 0n);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const statusResponse = await page.request.get(url + '/api/status');
  assert.ok(statusResponse.ok(), 'Start the local server before running UI checks.');
  const status = await statusResponse.json();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /Traquez les bugs/ }).waitFor();
  assert.equal(await page.locator('#wallet').textContent(), status.walletAddress || 'Non configuré');
  assert.equal(await page.locator('#agentId').textContent(), status.agentId || 'Non enregistrée');
  await page.getByRole('button', { name: 'Charger un exemple' }).click();
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/audits') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Lancer la mission' }).click();
  const response = await submitted;
  assert.ok(response.ok());
  const report = await response.json();
  await page.waitForFunction(() => !document.getElementById('analyze').disabled);
  assert.equal(await page.locator('.finding').count(), report.findings.length);
  const audits = await (await page.request.get(url + '/api/audits')).json();
  assert.equal(await page.locator('#rewardCount').textContent(), exactAmount(paidTotal(audits)));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await page.close();
  console.log('PASS live API: status, audit, confirmed-only total, browser errors, responsive layout.');

  const html = await readFile(new URL('../modules/bnb-agent/web/index.html', import.meta.url), 'utf8');
  const validHash = '0x' + 'a'.repeat(64);
  const paid = { id: 'paid-fixture', findings: [], xp: 10, summary: 'Fixture uniquement', rewardState: 'paid', rewardAmountWei: '1000000000000001', transactionHash: validHash };
  const pending = { ...paid, id: 'submitted-fixture', xp: 20, rewardState: 'submitted', rewardAmountWei: '99000000000000000', transactionHash: 'javascript:alert(1)' };
  const fixture = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fixture.route('http://bnb.local/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(pathname === '/api/status' ? { mode: 'local', network: 'BSC Testnet' } : [paid, pending]) });
  });
  await fixture.goto('http://bnb.local', { waitUntil: 'networkidle' });
  assert.equal(await fixture.locator('#rewardCount').textContent(), '0.001000000000000001 tBNB');
  await fixture.getByRole('button', { name: /paid-fixture/ }).click();
  assert.equal(await fixture.locator('#results a').getAttribute('href'), 'https://testnet.bscscan.com/tx/' + validHash);
  await fixture.getByRole('button', { name: /submitted-fi/ }).click();
  assert.equal(await fixture.locator('#results a').count(), 0);
  assert.match(await fixture.locator('#results').textContent(), /Transaction soumise · confirmation en attente/);
  const labels = { unreviewed: 'En attente de revue humaine', pending: 'Validation approuvée · versement en attente', sending: 'Envoi en cours · confirmation non obtenue', submitted: 'Transaction soumise · confirmation en attente', paid: 'Récompense confirmée sur BSC Testnet', reverted: 'Transaction échouée · aucun versement', uncertain: 'Résultat incertain · vérification nécessaire' };
  for (const [state, label] of Object.entries(labels)) {
    await fixture.evaluate(({ report, state }) => showReport({ ...report, rewardState: state }), { report: paid, state });
    assert.ok((await fixture.locator('#results').textContent()).includes(label));
  }
  await fixture.evaluate(report => showReport({ ...report, findings: [{ title: '<img src=x onerror=alert(1)>', severity: 'high', line: 1, evidence: '<script>window.pwned=true</script>', recommendation: 'Fixture' }] }), paid);
  assert.equal(await fixture.locator('#results img').count(), 0);
  assert.equal(await fixture.evaluate(() => window.pwned), undefined);
  assert.equal(await fixture.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await fixture.evaluate(() => { reports = []; updateHistory(); });
  for (const [id, expected] of Object.entries({ missionCount: '0', findingCount: '0', xpCount: '0 XP', rewardCount: '0 tBNB' })) assert.equal(await fixture.locator('#' + id).textContent(), expected);
  await fixture.close();
  console.log('PASS fixtures: exact BigInt, reward states, safe tx links, literal HTML, mobile, empty counters. No transaction sent.');
} finally {
  await browser.close();
}
