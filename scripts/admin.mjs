// Run with `doppler run -- ...`. Never pass secret tokens on the command line.
const [action, id, ...flags] = process.argv.slice(2);
const option = name => { const i = flags.indexOf(name); return i < 0 ? undefined : flags[i + 1]; };
if (!['review', 'reward'].includes(action) || !/^audit_[a-f\d]{20}$/.test(id ?? '')) {
  console.error('Usage: node scripts/admin.mjs review|reward AUDIT_ID [--approve|--reject] [--recipient 0x...] [--send-testnet]');
  process.exit(1);
}
if (!process.env.BNB_ADMIN_TOKEN) throw new Error('BNB_ADMIN_TOKEN required through Doppler.');
if (action === 'review' && flags.includes('--approve') === flags.includes('--reject')) throw new Error('Choose exactly one of --approve or --reject.');
if (action === 'reward' && !flags.includes('--send-testnet')) throw new Error('Add --send-testnet for an explicit BSC Testnet transfer.');
const endpoint = new URL(process.env.BNB_LOCAL_ENDPOINT ?? 'http://127.0.0.1:3000');
if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid endpoint.');
if (endpoint.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) throw new Error('Use HTTPS for a remote endpoint.');
const body = { recipient: option('--recipient'), ...(action === 'review' ? { approved: flags.includes('--approve') } : {}) };
const response = await fetch(new URL(`/api/audits/${id}/${action}`, endpoint), {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.BNB_ADMIN_TOKEN}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000), redirect: 'error',
});
const result = await response.json();
if (!response.ok) { console.error(result.error ?? 'Operation refused.'); process.exit(1); }
console.log(JSON.stringify({ id: result.id, reviewApproved: result.reviewApproved, rewardState: result.rewardState, transactionHash: result.transactionHash }, null, 2));
