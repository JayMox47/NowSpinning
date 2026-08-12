import type { MusicFrameConfig } from "./config";

const TOKEN_KEY = "music-frame.spotify-token";
const VERIFIER_KEY = "music-frame.pkce-verifier";

export type SpotifyImage = { url: string; width?: number; height?: number };
export type SpotifyTrack = { id: string; name: string; track_number: number; disc_number: number; duration_ms: number };
export type SpotifyAlbum = {
  id: string;
  name: string;
  album_type?: string;
  artists: { name: string }[];
  images: SpotifyImage[];
  release_date: string;
  label?: string;
  genres?: string[];
  total_tracks: number;
  tracks: { items: SpotifyTrack[] };
};

type TokenRecord = { access_token: string; refresh_token?: string; expires_at: number };

const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomVerifier = () => base64Url(crypto.getRandomValues(new Uint8Array(64)));
const challengeFor = async (verifier: string) => base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));

const readToken = (): TokenRecord | null => {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; }
};

const saveToken = (payload: { access_token: string; refresh_token?: string; expires_in: number }, previous?: TokenRecord | null) => {
  const record: TokenRecord = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || previous?.refresh_token,
    expires_at: Date.now() + payload.expires_in * 1000 - 30000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(record));
  return record;
};

const tokenRequest = async (params: URLSearchParams) => {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!response.ok) throw new Error("Spotify token request failed");
  return response.json();
};

export async function beginSpotifyLogin(config: MusicFrameConfig) {
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: config.spotifyClientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: "user-read-currently-playing user-read-playback-state",
    code_challenge_method: "S256",
    code_challenge: await challengeFor(verifier),
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

export async function completeSpotifyLogin(config: MusicFrameConfig) {
  const code = new URLSearchParams(location.search).get("code");
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!code || !verifier) return false;
  const payload = await tokenRequest(new URLSearchParams({
    client_id: config.spotifyClientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  }));
  saveToken(payload);
  sessionStorage.removeItem(VERIFIER_KEY);
  history.replaceState({}, "", config.redirectUri);
  return true;
}

export function isSpotifyConnected() { return Boolean(readToken()?.refresh_token || readToken()?.access_token); }
export function disconnectSpotify() { localStorage.removeItem(TOKEN_KEY); }

async function accessToken(config: MusicFrameConfig) {
  const token = readToken();
  if (!token) return null;
  if (token.expires_at > Date.now()) return token.access_token;
  if (!token.refresh_token) { disconnectSpotify(); return null; }
  try {
    const payload = await tokenRequest(new URLSearchParams({
      client_id: config.spotifyClientId,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }));
    return saveToken(payload, token).access_token;
  } catch { disconnectSpotify(); return null; }
}

async function api<T>(path: string, config: MusicFrameConfig): Promise<T | null> {
  const token = await accessToken(config);
  if (!token) return null;
  const response = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 204) return null;
  if (response.status === 401) { disconnectSpotify(); return null; }
  if (!response.ok) throw new Error(`Spotify API error ${response.status}`);
  return response.json();
}

export async function getCurrentlyPlaying(config: MusicFrameConfig) {
  return api<{ is_playing: boolean; item?: { album?: SpotifyAlbum } }>("/me/player/currently-playing", config);
}

export async function getAlbum(id: string, config: MusicFrameConfig) {
  return api<SpotifyAlbum>(`/albums/${encodeURIComponent(id)}`, config);
}

export async function searchAlbums(query: string, config: MusicFrameConfig) {
  if (!query.trim()) return [];
  const data = await api<{ albums: { items: SpotifyAlbum[] } }>(`/search?type=album&limit=8&q=${encodeURIComponent(query)}`, config);
  return data?.albums.items || [];
}
