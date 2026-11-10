import { createHash } from 'node:crypto';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  line: number;
  evidence: string;
  recommendation: string;
}
export interface AuditReport {
  id: string;
  filename: string;
  findings: Finding[];
  score: number;
  xp: number;
  rewardEligible: boolean;
  summary: string;
  createdAt: string;
}
export const MAX_SOURCE_BYTES = 200 * 1024;
const hash = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 20);

/** Hide comments and optionally string contents while preserving offsets/newlines. */
function mask(source: string, strings = false): string {
  let result = '';
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    const n = source[i + 1];
    if (state === 'line') {
      result += c === '\n' ? '\n' : ' ';
      if (c === '\n') state = 'code';
      continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { result += '  '; i++; state = 'code'; }
      else result += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (state !== 'code') {
      result += strings && c !== '\n' ? ' ' : c;
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if ((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'template' && c === '`')) state = 'code';
      continue;
    }
    if (c === '/' && n === '/') { result += '  '; i++; state = 'line'; continue; }
    if (c === '/' && n === '*') { result += '  '; i++; state = 'block'; continue; }
    if (c === "'" || c === '"' || c === '`') {
      state = c === "'" ? 'single' : c === '"' ? 'double' : 'template';
      result += strings ? ' ' : c;
    } else result += c;
  }
  return result;
}

function firstArgument(source: string, start: number): string {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i]!;
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' && depth === 0 || c === ',' && depth === 0) return source.slice(start, i).trim();
    if (c === ')' || c === ']' || c === '}') depth--;
  }
  return source.slice(start).trim();
}
const staticLiteral = (s: string): boolean => /^"(?:\\.|[^"\\])*"$/.test(s) || /^'(?:\\.|[^'\\])*'$/.test(s) || (/^`(?:\\.|[^`\\])*`$/.test(s) && !s.includes('${'));

/** Local heuristic review only: never executes source or contacts a target. */
export function audit(input: { source: string; filename?: string }): AuditReport {
  if (!input || typeof input.source !== 'string') throw new TypeError('source doit être une chaîne de caractères');
  if (Buffer.byteLength(input.source, 'utf8') > MAX_SOURCE_BYTES) throw new RangeError('Source trop volumineuse (200 Kio maximum)');
  if (!input.source.trim()) throw new TypeError('Le code source est vide');
  const source = input.source;
  const text = mask(source);
  const code = mask(source, true);
  const reportId = `audit_${hash(source)}`;
  const findings: Finding[] = [];
  const seen = new Set<string>();
  let truncated = false;
  const add = (rule: string, title: string, severity: Severity, offset: number, recommendation: string): void => {
    if (findings.length >= 100) { truncated = true; return; }
    const line = source.slice(0, offset).split('\n').length;
    const key = `${rule}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Evidence is deliberately generated from the rule, never copied from untrusted source.
    // No literal secret or surrounding code can leak into a returned report.
    findings.push({ id: `finding_${hash(`${reportId}:${key}`)}`, title, severity, line,
      evidence: `${rule} détecté à la ligne ${line} ; valeurs du code masquées.`, recommendation });
  };
  for (const m of code.matchAll(/\beval\s*\(/g)) {
    if (/[\w$.]/.test(code[m.index! - 1] ?? '')) continue;
    add('dynamic-eval', 'Exécution dynamique avec eval', 'high', m.index!, 'Remplacer eval par un parseur de données ou une liste explicite d’opérations autorisées.');
  }
  for (const m of code.matchAll(/\bnew\s+Function\s*\(/g)) add('dynamic-function', 'Construction dynamique de code', 'high', m.index!, 'Éviter new Function et utiliser des fonctions définies à l’avance.');
  for (const m of text.matchAll(/\b(?:private_?key|secret_?key|wallet_?key)\b\s*[:=]\s*['"](?:0x)?[a-f\d]{64}['"]/gi)) {
    if (!/\b(?:private_?key|secret_?key|wallet_?key)\b/i.test(code.slice(m.index!, m.index! + m[0].length))) continue;
    add('private-key-literal', 'Clé privée inscrite dans le code', 'critical', m.index!, 'Retirer la clé du code, la remplacer si elle a été exposée et utiliser un gestionnaire de secrets comme Doppler.');
  }
  const execNames = new Set<string>();
  const namespaces = new Set<string>();
  for (const m of text.matchAll(/(?:import\s*\{([^}]+)\}\s*from|(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\()\s*['"](?:node:)?child_process['"]/g)) {
    for (const binding of (m[1] ?? m[2] ?? '').split(',')) {
      const parsed = binding.trim().match(/^(execSync|exec)(?:\s+(?:as)\s+|\s*:\s*)?(\w+)?$/);
      if (parsed) execNames.add(parsed[2] ?? parsed[1]!);
    }
  }
  for (const m of text.matchAll(/(?:import\s+(?:\*\s+as\s+)?(\w+)\s+from|(?:const|let|var)\s+(\w+)\s*=\s*require\s*\()\s*['"](?:node:)?child_process['"]/g)) namespaces.add(m[1] ?? m[2]!);
  for (const m of code.matchAll(/\b([\w$]+)(?:\s*\.\s*(execSync|exec))?\s*\(/g)) {
    const unsafe = m[2] ? namespaces.has(m[1]!) || m[1] === 'child_process' : execNames.has(m[1]!);
    if (!unsafe) continue;
    const argument = firstArgument(text, m.index! + m[0].length);
    if (argument && !staticLiteral(argument)) add('shell-command', 'Commande shell construite dynamiquement', 'high', m.index!, 'Préférer execFile/spawn sans shell, des arguments séparés et une liste de commandes autorisées.');
  }
  for (const m of code.matchAll(/\.\s*(innerHTML|outerHTML)\s*=(?!=)/g)) {
    const rest = text.slice(m.index! + m[0].length).split(/;|\n/)[0]!.trim();
    if (staticLiteral(rest) && !/<script|\bon\w+\s*=|javascript:/i.test(rest)) continue;
    add('html-injection', 'Insertion HTML à contrôler', 'medium', m.index!, 'Utiliser textContent pour du texte ou une bibliothèque de nettoyage HTML éprouvée avant insertion.');
  }
  for (const m of text.matchAll(/\b(?:query|execute)\s*\(\s*(`[^`]*`|"(?:\\.|[^"\\])*"\s*\+|\x27(?:\\.|[^\x27\\])*\x27\s*\+)/g)) {
    if (!/\b(?:SELECT|INSERT|UPDATE|DELETE|WHERE)\b/i.test(m[1]!) || !(m[1]!.includes('${') || /\+\s*$/.test(m[1]!))) continue;
    if (!/\b(?:query|execute)\s*\(/.test(code.slice(m.index!, m.index! + 30))) continue;
    add('sql-interpolation', 'Requête SQL interpolée', 'high', m.index!, 'Utiliser les paramètres du pilote SQL ($1, ? ou paramètres nommés), sans interpolation du texte fourni.');
  }
  const weight: Record<Severity, number> = { critical: 30, high: 18, medium: 8, low: 3 };
  const xp = findings.reduce((total, finding) => total + weight[finding.severity], 0);
  return { id: reportId, filename: typeof input.filename === 'string' ? input.filename.slice(0, 160).replace(/[\x00-\x1f]/g, '') : 'source.ts', findings,
    score: Math.max(0, 100 - xp), xp, rewardEligible: findings.some(f => f.severity === 'high' || f.severity === 'critical'),
    summary: findings.length ? `${findings.length} signal(aux) à examiner.${truncated ? ' Rapport limité aux 100 premiers signaux.' : ''} Analyse statique heuristique ; validation humaine requise avant toute récompense.` : 'Aucun signal détecté par les règles disponibles. Ce résultat ne certifie pas la sécurité du code.',
    createdAt: new Date().toISOString() };
}
