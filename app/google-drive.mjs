import { GOOGLE_CLIENT_ID } from './google-config.mjs';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const BACKUP_PREFIX = 'shape-backup-';
const BACKUP_LIMIT = 7;
let accessToken = '';
let accessTokenExpiresAt = 0;
let gisPromise;

export const isGoogleConfigured = () => Boolean(GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.includes('COLE_'));
export const hasActiveGoogleToken = () => Boolean(accessToken && Date.now() < accessTokenExpiresAt - 30_000);

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar a autenticação do Google.'));
    document.head.append(script);
  });
  return gisPromise;
}

export async function requestGoogleAccess({ forcePrompt = false } = {}) {
  if (!isGoogleConfigured()) throw new Error('O Client ID Google ainda não foi configurado nesta PWA.');
  if (!forcePrompt && hasActiveGoogleToken()) return accessToken;
  await loadGoogleIdentityServices();
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (!response?.access_token) {
          reject(new Error(response?.error_description || response?.error || 'A autorização do Google foi cancelada.'));
          return;
        }
        accessToken = response.access_token;
        accessTokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
        resolve(accessToken);
      },
      error_callback: (error) => reject(new Error(error?.message || 'Não foi possível abrir a autorização do Google.')),
    });
    tokenClient.requestAccessToken({ prompt: forcePrompt || !accessToken ? 'consent' : '' });
  });
}

async function driveFetch(path, options = {}) {
  const token = hasActiveGoogleToken() ? accessToken : await requestGoogleAccess();
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (response.status === 401) {
    accessToken = '';
    accessTokenExpiresAt = 0;
    throw new Error('A autorização Google expirou. Toque em “Fazer backup agora” para autorizar novamente.');
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error?.message || `Erro do Google Drive (${response.status}).`);
  }
  return response;
}

function snapshotName(date = new Date()) {
  return `${BACKUP_PREFIX}${date.toISOString().replace(/[:.]/g, '-')}.json`;
}

export function selectBackupsForDeletion(files, limit = BACKUP_LIMIT) {
  return [...files]
    .sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))
    .slice(limit);
}

export async function listGoogleBackups() {
  const query = encodeURIComponent(`name contains '${BACKUP_PREFIX}' and trashed = false`);
  const fields = encodeURIComponent('files(id,name,modifiedTime,size)');
  const response = await driveFetch(`${DRIVE_API}/files?spaces=appDataFolder&q=${query}&orderBy=modifiedTime%20desc&pageSize=100&fields=${fields}`);
  const data = await response.json();
  return (data.files || []).sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
}

export async function uploadGoogleBackup(backup) {
  const boundary = `shape-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: snapshotName(), parents: ['appDataFolder'], mimeType: 'application/json' });
  const content = JSON.stringify(backup);
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  const response = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime,size`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const uploaded = await response.json();
  const files = await listGoogleBackups();
  await Promise.all(selectBackupsForDeletion(files).map((file) => driveFetch(`${DRIVE_API}/files/${file.id}`, { method: 'DELETE' })));
  return uploaded;
}

export async function downloadGoogleBackup(fileId) {
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return response.json();
}
