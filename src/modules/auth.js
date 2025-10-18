// Google Drive authentication utilities extracted from the main entrypoint.
// Handles Drive OAuth flow, token persistence, and helper utilities for other modules.

const GOOGLE_CLIENT_ID = '796428704868-sse38guap4kghi6ehbpv3tmh999hc9jm.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_REFRESH_COOKIE = 'drive_refresh_token';
const DRIVE_REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 days
const DRIVE_REFRESH_SESSION_FALLBACK = 'drive_refresh_token_fallback';
const OAUTH_EXCHANGE_ENDPOINT = 'https://bitwiser-server-divine-tree-6c9b.hyun0903053.workers.dev/oauth/exchange';
const OAUTH_REFRESH_ENDPOINT = 'https://bitwiser-server-divine-tree-6c9b.hyun0903053.workers.dev/oauth/refresh';
const OAUTH_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const OAUTH_REDIRECT_URI = typeof window !== 'undefined'
  ? new URL('oauth-callback.html', window.location.href).toString()
  : '';

let gapiInited = false;
let gapiInitPromise = null;
let tokenClient;
let driveTokenExpiry = 0;
let initializeAuthQueued = false;

export { GOOGLE_CLIENT_ID, DRIVE_SCOPE };

export function hasStoredDriveRefreshToken() {
  return Boolean(getCookieValue(DRIVE_REFRESH_COOKIE));
}

export function getCookieValue(name) {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.substring(prefix.length));
      } catch (err) {
        console.warn('Failed to decode cookie value', err);
        return trimmed.substring(prefix.length);
      }
    }
  }
  if (typeof window !== 'undefined' && window.location && window.location.protocol !== 'https:' && typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem(`${DRIVE_REFRESH_SESSION_FALLBACK}_${name}`);
  }
  return null;
}

export function setSecureCookie(name, value, maxAgeSeconds) {
  if (typeof document === 'undefined') return;
  let cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Strict`;
  if (typeof maxAgeSeconds === 'number') {
    cookie += `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`;
  }
  const isHttps = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
  if (isHttps) {
    cookie += '; Secure';
  }
  document.cookie = cookie;
  if (!isHttps && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(`${DRIVE_REFRESH_SESSION_FALLBACK}_${name}`, value);
    } catch (err) {
      console.warn('Failed to persist refresh token fallback in sessionStorage', err);
    }
  }
}

export function deleteCookie(name) {
  if (typeof document === 'undefined') return;
  const base = `${name}=; Path=/; Max-Age=0; SameSite=Strict`;
  document.cookie = `${base}; Secure`;
  document.cookie = base;
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(`${DRIVE_REFRESH_SESSION_FALLBACK}_${name}`);
  }
}

function applyDriveAccessToken(tokenData) {
  if (!tokenData || !tokenData.access_token) {
    throw new Error('Invalid token data');
  }
  const token = {
    access_token: tokenData.access_token,
    token_type: tokenData.token_type || 'Bearer',
    scope: tokenData.scope || DRIVE_SCOPE
  };
  if (tokenData.expires_in) {
    token.expires_in = tokenData.expires_in;
  }
  if (tokenData.expires_in) {
    driveTokenExpiry = Date.now() + Math.max(0, (tokenData.expires_in - 60)) * 1000;
  } else {
    driveTokenExpiry = Date.now() + 5 * 60 * 1000; // default to 5 minutes
  }
  if (typeof gapi !== 'undefined' && gapi.client) {
    gapi.client.setToken(token);
  } else if (typeof window !== 'undefined' && window.gapi && window.gapi.client) {
    window.gapi.client.setToken(token);
  }
}

export function configureGoogleProviderForDrive(provider, options = {}) {
  if (!provider || typeof provider.addScope !== 'function') {
    return provider;
  }
  try {
    provider.addScope(DRIVE_SCOPE);
  } catch (err) {
    console.warn('Failed to append Drive scope to GoogleAuthProvider', err);
  }
  if (typeof provider.setCustomParameters !== 'function') {
    return provider;
  }
  const params = {
    include_granted_scopes: 'true',
    access_type: 'offline'
  };
  if (options && options.forceConsent) {
    params.prompt = 'consent';
  } else if (options && options.prompt) {
    params.prompt = options.prompt;
  }
  if (options && options.loginHint) {
    params.login_hint = options.loginHint;
  }
  try {
    provider.setCustomParameters(params);
  } catch (err) {
    console.warn('Failed to set Drive custom parameters on GoogleAuthProvider', err);
  }
  return provider;
}

function normalizeExpiresInSeconds(tokenResponse, credential = null) {
  if (tokenResponse && tokenResponse.oauthExpirationTime) {
    const rawExpiration = Number(tokenResponse.oauthExpirationTime);
    if (Number.isFinite(rawExpiration) && rawExpiration > 0) {
      const millis = rawExpiration > 1e12 ? rawExpiration : rawExpiration * 1000;
      const deltaMs = millis - Date.now();
      if (deltaMs > 0) {
        return Math.floor(deltaMs / 1000);
      }
    }
  }
  const candidates = [
    tokenResponse && tokenResponse.oauthExpireIn,
    tokenResponse && tokenResponse.oauthExpiresIn,
    tokenResponse && tokenResponse.expiresIn,
    tokenResponse && tokenResponse.expires_in,
    credential && credential.expiresIn,
    credential && credential.expires_in
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

export function persistDriveTokensFromFirebaseResult(result) {
  if (!result) return false;

  const tokenResponse = result._tokenResponse || result.tokenResponse || {};

  let credential = result.credential || null;
  if (!credential && typeof firebase !== 'undefined' && firebase.auth && firebase.auth.GoogleAuthProvider) {
    const { GoogleAuthProvider } = firebase.auth;
    if (GoogleAuthProvider && typeof GoogleAuthProvider.credentialFromResult === 'function') {
      try {
        credential = GoogleAuthProvider.credentialFromResult(result) || null;
      } catch (err) {
        console.warn('Failed to derive OAuth credential from Firebase result', err);
      }
    }
  }
  const credentialObj = credential && typeof credential === 'object' ? credential : {};
  const credentialResponse =
    credentialObj._tokenResponse ||
    credentialObj.tokenResponse ||
    credentialObj.response ||
    credentialObj.oauthResponse ||
    credentialObj.serverResponse ||
    {};

  const refreshTokenCandidates = [
    tokenResponse.oauthRefreshToken,
    tokenResponse.refreshToken,
    tokenResponse.refresh_token,
    tokenResponse.firstRefreshToken,
    tokenResponse.oauth_refresh_token,
    credentialObj.refreshToken,
    credentialObj.refresh_token,
    credentialResponse.oauthRefreshToken,
    credentialResponse.refreshToken,
    credentialResponse.refresh_token
  ];
  const refreshToken = refreshTokenCandidates.find(token => typeof token === 'string' && token.length > 0) || null;

  if (refreshToken) {
    setSecureCookie(DRIVE_REFRESH_COOKIE, refreshToken, DRIVE_REFRESH_COOKIE_MAX_AGE);
  }

  const accessTokenCandidates = [
    tokenResponse.oauthAccessToken,
    tokenResponse.accessToken,
    tokenResponse.access_token,
    credentialObj.accessToken,
    credentialObj.access_token,
    credentialResponse.oauthAccessToken,
    credentialResponse.accessToken,
    credentialResponse.access_token
  ];
  const accessToken = accessTokenCandidates.find(token => typeof token === 'string' && token.length > 0) || null;

  const scopeCandidates = [
    tokenResponse.oauthScopes,
    tokenResponse.scopes,
    credentialObj.scope,
    credentialObj.scopes,
    credentialResponse.oauthScopes,
    credentialResponse.scope,
    credentialResponse.scopes
  ];
  const scopeRaw = scopeCandidates.find(value => Array.isArray(value) ? value.length > 0 : typeof value === 'string');
  const scope = Array.isArray(scopeRaw)
    ? scopeRaw.join(' ')
    : (typeof scopeRaw === 'string' && scopeRaw.length > 0 ? scopeRaw : DRIVE_SCOPE);

  const expiresIn = normalizeExpiresInSeconds(tokenResponse, credentialObj);
  if (accessToken) {
    try {
      applyDriveAccessToken({ access_token: accessToken, expires_in: expiresIn, scope });
    } catch (err) {
      console.warn('Failed to apply Drive tokens from Firebase sign-in result', err);
    }
  }

  return Boolean(refreshToken || accessToken);
}

export async function exchangeCodeForTokens(code, codeVerifier) {
  const res = await fetch(
    OAUTH_EXCHANGE_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
      credentials: 'omit'
    }
  );

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error('Failed to parse Drive OAuth exchange response', err);
    data = {};
  }
  if (!res.ok) {
    const message = data.error_description || data.error || 'token_exchange_failed';
    console.error('Drive OAuth code exchange failed', message);
    throw new Error(message);
  }
  return data;
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch(
    OAUTH_REFRESH_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      credentials: 'omit'
    }
  );

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error('Failed to parse Drive OAuth refresh response', err);
    data = {};
  }
  if (!res.ok) {
    const message = data.error_description || data.error || 'refresh_failed';
    throw new Error(message);
  }

  if (data.refresh_token) {
    setSecureCookie(DRIVE_REFRESH_COOKIE, data.refresh_token, DRIVE_REFRESH_COOKIE_MAX_AGE);
  } else {
    console.warn('Drive refresh response did not include a refresh_token; retaining existing cookie.');
    const rt = getCookieValue(DRIVE_REFRESH_COOKIE);
    if (rt) {
      setSecureCookie(DRIVE_REFRESH_COOKIE, rt, DRIVE_REFRESH_COOKIE_MAX_AGE);
    }
  }
  applyDriveAccessToken(data);
  return data;
}

export async function revokeDriveAccess(token) {
  if (!token) return false;
  try {
    const response = await fetch(OAUTH_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString()
    });
    if (!response.ok) {
      console.warn('Failed to revoke Drive access token', await response.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Error while revoking Drive access token', err);
    return false;
  }
}

function createRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  let result = '';
  for (let i = 0; i < array.length; i++) {
    result += charset.charAt(array[i] % charset.length);
  }
  return result;
}

async function pkceChallengeFromVerifier(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64;
}

async function generatePkcePair() {
  const codeVerifier = createRandomString(64);
  const codeChallenge = await pkceChallengeFromVerifier(codeVerifier);
  return { codeVerifier, codeChallenge };
}

function waitForOAuthCode(popup, state) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error('oauth_timeout'));
      }
    }, 120000);
    const closeCheck = setInterval(() => {
      if (!resolved && popup && popup.closed) {
        cleanup();
        reject(new Error('oauth_window_closed'));
      }
    }, 500);

    function cleanup() {
      resolved = true;
      clearTimeout(timeout);
      clearInterval(closeCheck);
      window.removeEventListener('message', onMessage);
      if (popup && !popup.closed) {
        popup.close();
      }
    }

    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data.type !== 'drive_oauth_callback') return;
      if (data.state !== state) return;
      if (data.error) {
        cleanup();
        const errMsg = data.error_description || data.error;
        reject(new Error(errMsg || 'oauth_error'));
        return;
      }
      if (data.code) {
        cleanup();
        resolve(data.code);
      }
    }

    window.addEventListener('message', onMessage);
  });
}

export async function obtainDriveTokensViaOAuth(options = {}) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('crypto_unsupported');
  }
  const { codeVerifier, codeChallenge } = await generatePkcePair();
  const state = createRandomString(32);
  sessionStorage.setItem(`drive_pkce_${state}`, codeVerifier);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: options.prompt || 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  if (options && options.hint) {
    params.set('login_hint', options.hint);
  }

  const popup = window.open(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    'drive_oauth',
    'width=480,height=640'
  );
  if (!popup) {
    sessionStorage.removeItem(`drive_pkce_${state}`);
    throw new Error(typeof t === 'function' ? t('loginRequired') : 'login_required');
  }

  try {
    const code = await waitForOAuthCode(popup, state);
    const storedVerifier = sessionStorage.getItem(`drive_pkce_${state}`) || codeVerifier;
    sessionStorage.removeItem(`drive_pkce_${state}`);
    const tokens = await exchangeCodeForTokens(code, storedVerifier);
    if (tokens.refresh_token) {
      setSecureCookie(DRIVE_REFRESH_COOKIE, tokens.refresh_token, DRIVE_REFRESH_COOKIE_MAX_AGE);
    } else {
      console.warn('Drive OAuth response did not include a refresh_token; revoking consent may be required to obtain one.');
    }
    applyDriveAccessToken(tokens);
    return tokens;
  } catch (err) {
    sessionStorage.removeItem(`drive_pkce_${state}`);
    throw err;
  }
}

export function initDriveClient() {
  if (typeof window === 'undefined' || !window.gapi) {
    return null;
  }
  if (gapiInitPromise) {
    return gapiInitPromise;
  }
  gapiInitPromise = new Promise(resolve => {
    window.gapi.load('client', async () => {
      await window.gapi.client.init({
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
      });
      gapiInited = true;
      resolve();
    });
  });
  return gapiInitPromise;
}

export function initTokenClient() {
  if (tokenClient) {
    return tokenClient;
  }
  if (typeof window === 'undefined' || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    return null;
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (tokenResponse) => {
      try {
        applyDriveAccessToken(tokenResponse);
      } catch (err) {
        console.warn('Failed to apply Drive access token', err);
      }
      if (tokenResponse && tokenResponse.refresh_token) {
        setSecureCookie(DRIVE_REFRESH_COOKIE, tokenResponse.refresh_token, DRIVE_REFRESH_COOKIE_MAX_AGE);
      }
      if (tokenClient && tokenClient.onResolve) {
        const cb = tokenClient.onResolve;
        tokenClient.onResolve = null;
        cb(tokenResponse);
      }
    }
  });
  return tokenClient;
}

export function initializeAuth() {
  if (initializeAuthQueued || typeof window === 'undefined') {
    return;
  }
  initializeAuthQueued = true;
  const runInit = () => {
    const gapiPromise = initDriveClient();
    if (gapiPromise && typeof gapiPromise.then === 'function') {
      gapiPromise.catch(err => console.warn('Failed to initialize gapi client', err));
    }
    initTokenClient();
  };

  if (document.readyState === 'complete') {
    runInit();
  } else {
    window.addEventListener('load', runInit, { once: true });
  }
}

function getGapiClient() {
  if (typeof gapi !== 'undefined' && gapi.client) return gapi.client;
  if (typeof window !== 'undefined' && window.gapi && window.gapi.client) return window.gapi.client;
  return null;
}

export async function ensureDriveAuth() {
  const user = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
  if (!user) {
    throw new Error(typeof t === 'function' ? t('googleLoginPrompt') : 'google_login_required');
  }
  if (!gapiInited) {
    const initPromise = gapiInitPromise || initDriveClient();
    if (initPromise) {
      await initPromise;
    } else {
      throw new Error(typeof t === 'function' ? t('loginRequired') : 'login_required');
    }
  }
  const gapiClient = getGapiClient();
  if (!gapiClient) {
    throw new Error('gapi_unavailable');
  }
  const now = Date.now();
  let token = gapiClient.getToken();
  if (token && token.access_token && driveTokenExpiry - now > 5000 && token.scope && token.scope.includes(DRIVE_SCOPE)) {
    return token;
  }

  const storedRefreshToken = getCookieValue(DRIVE_REFRESH_COOKIE);
  if (storedRefreshToken) {
    try {
      await refreshAccessToken(storedRefreshToken);
      return gapiClient.getToken();
    } catch (refreshError) {
      console.warn('Failed to refresh Drive access token', refreshError);
      const errMsg = (refreshError && refreshError.message) ? refreshError.message : '';
      if (errMsg.toLowerCase().includes('invalid_grant')) {
        deleteCookie(DRIVE_REFRESH_COOKIE);
      }
    }
  }

  try {
    const hintOptions = user && user.email ? { hint: user.email } : {};
    let tokens = await obtainDriveTokensViaOAuth(hintOptions);
    if (!tokens.refresh_token) {
      console.warn('Re-attempting Drive OAuth after revoking previous grant to acquire a refresh_token.');
      await revokeDriveAccess(tokens.access_token);
      deleteCookie(DRIVE_REFRESH_COOKIE);
      tokens = await obtainDriveTokensViaOAuth({ ...hintOptions, prompt: 'consent select_account' });
      if (!tokens.refresh_token) {
        console.warn('Drive OAuth still did not provide a refresh_token. Please revoke the app\'s Drive access from your Google Account settings and try again.');
      }
    }
    if (tokens && tokens.refresh_token) {
      setSecureCookie(DRIVE_REFRESH_COOKIE, tokens.refresh_token, DRIVE_REFRESH_COOKIE_MAX_AGE);
    }
    return gapiClient.getToken();
  } catch (oauthError) {
    console.error('Failed to obtain Drive refresh token via OAuth', oauthError);
    const client = tokenClient || initTokenClient();
    if (!client) {
      throw new Error(typeof t === 'function' ? t('loginRequired') : 'login_required');
    }
    const requestToken = (options) => new Promise((resolve, reject) => {
      client.onResolve = (resp) => {
        if (resp.error) {
          reject(new Error(resp.error));
        } else {
          resolve(resp);
        }
      };
      try {
        client.requestAccessToken(options);
      } catch (err) {
        reject(err);
      }
    });
    const hintOptions = user && user.email ? { hint: user.email } : {};
    try {
      try {
        token = await requestToken({ prompt: 'none', ...hintOptions });
      } catch (eEmpty) {
        if (eEmpty instanceof TypeError) {
          token = await requestToken({ prompt: 'none', ...hintOptions });
        } else {
          throw eEmpty;
        }
      }
    } catch (e) {
      const err = (e.message || '').toLowerCase();
      if (err.includes('login') || err.includes('idpiframe')) {
        throw new Error(typeof t === 'function' ? t('googleLoginPrompt') : 'google_login_required');
      } else if (err.includes('consent') || err.includes('interaction')) {
        try {
          token = await requestToken({ prompt: 'consent', ...hintOptions });
        } catch (e2) {
          throw new Error(typeof t === 'function' ? t('loginRequired') : 'login_required');
        }
      } else {
        throw new Error(typeof t === 'function' ? t('loginRequired') : 'login_required');
      }
    }
    return token;
  }
}

export function getDriveTokenExpiry() {
  return driveTokenExpiry;
}

export function getTokenClient() {
  return tokenClient;
}

export function getGapiInitPromise() {
  return gapiInitPromise;
}
