import { audit } from './bnb/auditor.js';
import type { RunWork } from './sellerCore.js';

/** Paid work is restricted to supplied source text. Never fetch or execute it. */
export const runAuditWork: RunWork = async (prompt, { abortSignal }) => {
  abortSignal?.throwIfAborted();
  if (prompt.length > 220_000) throw new Error('Audit request too large (maximum 220 KB).');
  let input: unknown;
  try { input = JSON.parse(prompt); }
  catch { throw new Error('Expected JSON {"source":"code to audit","filename":"example.ts"}.'); }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected a JSON object with source text.');
  }
  const item = input as Record<string, unknown>;
  if (typeof item.source !== 'string' || !item.source.trim() || item.source.length > 200_000) {
    throw new Error('source must contain between 1 and 200,000 characters.');
  }
  if (item.filename !== undefined && (typeof item.filename !== 'string' || item.filename.length > 200)) {
    throw new Error('filename must be a string of at most 200 characters.');
  }
  const report = await audit({ source: item.source, filename: item.filename as string | undefined });
  abortSignal?.throwIfAborted();
  return JSON.stringify(report);
};
