import test from 'node:test';
import assert from 'node:assert/strict';
import { runAuditWork } from '../dist/auditWork.js';
import { SellerCore } from '../dist/sellerCore.js';

test('verified ERC-8183 task reaches the JSON audit hook without an LLM wrapper', async () => {
  const secret = 'ab'.repeat(32);
  const source = `const privateKey = "${secret}";\neval(userInput);`;
  let submitted;
  class TestSeller extends SellerCore {
    deliver() { return this.doWorkAndSubmit(42); }
  }
  const seller = new TestSeller({
    runWork: runAuditWork,
    generator: 'lvxterminator',
    signing: {
      async jobSpec() { return { task: JSON.stringify({ source, filename: 'demo.ts' }), terms: {} }; },
      async submitResult(_id, content) {
        submitted = content;
        return { submitTx: 'test-transaction', deliverableUrl: 'test-deliverable' };
      },
    },
  });
  const result = await seller.deliver();
  assert.equal(result.ok, true);
  const report = JSON.parse(submitted);
  assert.ok(report.findings.some(f => f.severity === 'critical'));
  assert.ok(!submitted.includes(secret));
  assert.ok(!submitted.includes(source));
});

test('audit hook rejects URLs and honors cancellation before work', async () => {
  await assert.rejects(runAuditWork('https://example.com/private-code', { sessionId: 'invalid' }), /Expected JSON/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runAuditWork('{"source":"const a = 1"}', { sessionId: 'abort', abortSignal: controller.signal }), { name: 'AbortError' });
});
