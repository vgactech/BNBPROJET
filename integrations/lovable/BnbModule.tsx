import { useEffect, useMemo, useState } from 'react';

export type BnbModuleProps = { moduleUrl?: string };
type ModuleLocation = { url: string; origin: string; error?: never } | { error: string; url?: never; origin?: never };

const isLoopback = (hostname: string) =>
  ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname.toLowerCase());

/** Accept an origin only. Never carry credentials, query values or a path. */
export function resolveBnbModuleUrl(value: string | undefined, parentOrigin: string): ModuleLocation {
  const raw = value?.trim() ?? '';
  if (!raw) return { error: 'L’adresse du module BNB n’est pas configurée.' };
  if (!/^https?:\/\/[^\s/?#\\@]+\/?$/i.test(raw)) {
    return { error: 'Utiliser uniquement une origine HTTPS, sans chemin ni paramètres.' };
  }
  try {
    const url = new URL(raw);
    const parent = new URL(parentOrigin);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      return { error: 'Les identifiants, chemins et paramètres ne sont pas acceptés.' };
    }
    const localDevelopment = url.protocol === 'http:' && isLoopback(url.hostname) && isLoopback(parent.hostname);
    if (url.protocol !== 'https:' && !localDevelopment) {
      return { error: 'HTTPS est requis. HTTP est réservé aux deux applications sur localhost.' };
    }
    if (url.origin === parent.origin) {
      return { error: 'Le module BNB doit utiliser une origine distincte de cette page.' };
    }
    return { url: `${url.origin}/`, origin: url.origin };
  } catch {
    return { error: 'L’adresse du module BNB est invalide.' };
  }
}

/** Portable React host: no wallet, bearer token or parent session is forwarded. */
export default function BnbModule({ moduleUrl }: BnbModuleProps) {
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);
  const [frameState, setFrameState] = useState<'loading' | 'loaded' | 'error'>('loading');
  useEffect(() => { setParentOrigin(window.location.origin); }, []);
  useEffect(() => { setFrameState('loading'); }, [moduleUrl]);
  const location = useMemo(() => parentOrigin ? resolveBnbModuleUrl(moduleUrl, parentOrigin) : null,
    [moduleUrl, parentOrigin]);

  return (
    <section aria-labelledby="bnb-module-title" style={{ color: '#edf1fb', background: '#101522', borderRadius: 16, padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
        <div>
          <p style={{ color: '#f0b90b', margin: '0 0 6px', fontSize: 13 }}>BNB · MODULE LVX</p>
          <h1 id="bnb-module-title" style={{ margin: 0, fontSize: 26 }}>LVX terminator</h1>
          <p style={{ color: '#b6c1d3', marginBottom: 0 }}>Missions d’audit et progression pour repérer les bugs du code.</p>
        </div>
        {location?.url && (
          <a href={location.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
            style={{ color: '#101522', background: '#f0b90b', padding: '11px 16px', borderRadius: 8, textDecoration: 'none' }}>
            Ouvrir le module ↗
          </a>
        )}
      </header>

      <p role="status" aria-live="polite" style={{ color: '#b6c1d3', margin: '20px 0 12px' }}>
        {!location ? 'Préparation du module…' : location.error ? location.error :
          frameState === 'loading' ? 'Chargement de la page du module…' :
          frameState === 'error' ? 'Le cadre n’a pas pu être chargé. Utilise le lien pour ouvrir le module.' :
          'Cadre chargé. Vérifie la disponibilité de l’agent dans le module ; le lien permet aussi de l’ouvrir directement.'}
      </p>

      {location?.url && (
        <>
          <p style={{ fontSize: 12, color: '#8e9db3', overflowWrap: 'anywhere' }}>Origine du module : {location.origin}</p>
          <iframe key={location.url} src={location.url} title="LVX terminator — module BNB"
            sandbox="allow-scripts allow-forms allow-same-origin"
            allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'"
            referrerPolicy="no-referrer" loading="lazy"
            onLoad={() => setFrameState('loaded')} onError={() => setFrameState('error')}
            style={{ display: 'block', width: '100%', height: '75vh', minHeight: 480, border: '1px solid #2a3549', borderRadius: 12, background: '#0b101a' }} />
        </>
      )}
    </section>
  );
}
