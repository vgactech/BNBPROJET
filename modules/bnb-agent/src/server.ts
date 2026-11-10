import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { audit } from './auditor.ts';
import { isAddress } from 'viem';
import { AuditStore } from './store.ts';
import { createTestnetRewardSender, validateReward, type RewardSender } from './rewards.ts';

const BODY_LIMIT = 220 * 1024;
const REWARD_WEI = 100_000_000_000_000n;
class HttpError extends Error { readonly status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function json(res: ServerResponse, status: number, value: unknown): void { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Content-Type application/json requis.');
  if (Number(req.headers['content-length'] ?? 0) > BODY_LIMIT) { req.resume(); throw new HttpError(413, 'Requête trop volumineuse.'); }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size <= BODY_LIMIT) chunks.push(bytes);
  }
  if (size > BODY_LIMIT) throw new HttpError(413, 'Requête trop volumineuse.');
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new HttpError(400, 'JSON invalide.'); }
}
function authorized(req: IncomingMessage, token?: string): boolean {
  if (!token || token.length < 16) return false;
  const supplied = req.headers.authorization ?? '';
  const expected = `Bearer ${token}`;
  return Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
function allowedFrameOrigins(): string[] {
  const origins = new Set(['https://artcbx-feature-flight.lovable.app']);
  for (const item of (process.env.LVX_ORIGIN ?? '').split(',')) {
    try { const url = new URL(item.trim()); if (url.protocol === 'https:' && !url.username && !url.password && url.origin === item.trim()) origins.add(url.origin); } catch { /* Ignore invalid origins. */ }
  }
  return [...origins];
}
export function createApp(options: { dataDir: string; adminToken?: string; rewardSender?: RewardSender }): Server {
  mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
  const store = new AuditStore(join(options.dataDir, 'audits.sqlite'));
  const page = readFileSync(new URL('../web/index.html', import.meta.url));
  const origins = allowedFrameOrigins();
  const throttle = new Map<string, { count: number; start: number }>();
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self' ${origins.join(' ')}; object-src 'none'; base-uri 'none'`);
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page); return; }
      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz')) { json(res, 200, { ok: true }); return; }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const publicWallet = process.env.BNB_WALLET_ADDRESS;
        json(res, 200, { name: 'LVX Terminator', chainId: 97, mode: 'local', network: 'BSC Testnet', walletAddress: publicWallet && isAddress(publicWallet) ? publicWallet : null, agentId: null,
          studioInstalled: existsSync(resolve('node_modules/@bnbagent/studio-cli/package.json')),
          rewardMode: 'review-required', payoutStatus: options.rewardSender ? 'testnet-ready' : 'not-configured' }); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/audits') { json(res, 200, store.list()); return; }
      if (req.method !== 'POST') throw new HttpError(404, 'Route introuvable.');
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}` && !origins.includes(req.headers.origin)) throw new HttpError(403, 'Origine refusée.');
      if (url.pathname === '/api/audits') {
        const key = req.socket.remoteAddress ?? 'local';
        const now = Date.now();
        let rate = throttle.get(key);
        if (!rate || now - rate.start > 60_000) { rate = { count: 0, start: now }; throttle.set(key, rate); }
        if (++rate.count > 40) throw new HttpError(429, 'Trop de missions. Réessayez dans une minute.');
        if (throttle.size > 1000) for (const [ip, entry] of throttle) if (now - entry.start > 60_000) throttle.delete(ip);
        const body = await readJson(req);
        if (typeof body.source !== 'string' || body.filename !== undefined && typeof body.filename !== 'string') throw new HttpError(400, 'Code source ou nom de fichier invalide.');
        let report;
        try { report = audit({ source: body.source, filename: body.filename as string | undefined }); }
        catch (error) { throw new HttpError(error instanceof RangeError ? 413 : 400, error instanceof RangeError ? 'Code limité à 200 Kio.' : 'Code source invalide ou vide.'); }
        json(res, 200, store.save(report)); return;
      }
      const match = url.pathname.match(/^\/api\/audits\/(audit_[a-f\d]{20})\/(review|reward)$/);
      if (!match) throw new HttpError(404, 'Route introuvable.');
      if (!authorized(req, options.adminToken)) throw new HttpError(401, 'Authentification administrateur requise.');
      const id = match[1]!;
      const existing = store.get(id);
      if (!existing) throw new HttpError(404, 'Mission introuvable.');
      const body = await readJson(req);
      let recipient: string | null = null;
      if (body.recipient !== undefined) {
        try { recipient = validateReward(body.recipient as string, REWARD_WEI).recipient; }
        catch { throw new HttpError(400, 'Adresse bénéficiaire invalide.'); }
      }
      if (match[2] === 'review') {
        if (typeof body.approved !== 'boolean') throw new HttpError(400, 'Le champ approved doit être un booléen.');
        try { json(res, 200, store.review(id, body.approved, recipient)); }
        catch { throw new HttpError(409, 'Mission verrouillée après une tentative de versement.'); }
        return;
      }
      if (!options.rewardSender) throw new HttpError(503, 'Wallet testnet non configuré.');
      if (!recipient) throw new HttpError(400, 'Adresse bénéficiaire requise.');
      if (!store.reserveReward(id, recipient)) throw new HttpError(409, 'Récompense non approuvée, bénéficiaire différent ou versement déjà engagé.');
      try {
        const sent = await options.rewardSender.pay({ auditId: id, recipient, amountWei: REWARD_WEI });
        if (!/^0x[a-f\d]{64}$/i.test(sent.transactionHash)) throw new Error('invalid hash');
        store.recordSubmitted(id, sent.transactionHash);
        json(res, 202, store.get(id));
      } catch {
        store.recordUncertain(id);
        throw new HttpError(502, 'Résultat de versement incertain. Réconciliation manuelle nécessaire avant toute nouvelle opération.');
      }
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Erreur interne.' });
      else res.end();
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on('close', () => store.close());
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let rewardSender: RewardSender | undefined;
  if (process.env.BNB_TREASURY_PRIVATE_KEY) rewardSender = createTestnetRewardSender();
  const server = createApp({ dataDir: process.env.BNB_DATA_DIR ?? './data', adminToken: process.env.BNB_ADMIN_TOKEN, rewardSender });
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`LVX Terminator: http://localhost:${port} (BSC Testnet uniquement)`));
}
