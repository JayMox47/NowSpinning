import type { SpotifyAlbum, SpotifyTrack } from "./spotify";

const DB_NAME = "music-frame.catalog";
const STORE = "albums";
const DB_VERSION = 1;
let nextRequestAt = 0;
let requestChain = Promise.resolve();

type MusicBrainzArtistCredit = { name: string };
type MusicBrainzRelease = {
  id: string;
  title: string;
  date?: string;
  country?: string;
  "artist-credit"?: MusicBrainzArtistCredit[];
  "release-group"?: { id: string; "primary-type"?: string };
  "label-info"?: { label?: { name?: string } }[];
  media?: { position?: number; tracks?: { id?: string; title: string; number?: string; position?: number; length?: number; recording?: { id?: string; title?: string } }[] }[];
};

export type CatalogAlbum = SpotifyAlbum & {
  catalogSource?: "musicbrainz" | "spotify";
  spotifyAlbumId?: string;
};

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function cacheAlbum(album: CatalogAlbum) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(album);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* IndexedDB may be unavailable in private browsing. */ }
  return album;
}

async function cacheCover(album: CatalogAlbum) {
  const url = album.images?.[0]?.url;
  if (!url || url.startsWith("data:")) return album;
  try {
    const response = await fetch(url);
    if (!response.ok) return album;
    const blob = await response.blob();
    if (blob.size > 8_000_000) return album;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { ...album, images: [{ url: dataUrl, width: 1200, height: 1200 }, ...album.images.slice(1)] };
  } catch { return album; }
}

export async function getCachedAlbum(id: string): Promise<CatalogAlbum | null> {
  try {
    const db = await openDb();
    const result = await new Promise<CatalogAlbum | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result || null;
  } catch { return null; }
}

export async function getCachedAlbums(ids: string[]) {
  return (await Promise.all(ids.map(getCachedAlbum))).filter((album): album is CatalogAlbum => Boolean(album));
}

async function musicBrainz<T>(path: string): Promise<T> {
  let releaseQueue!: () => void;
  const previous = requestChain;
  requestChain = new Promise<void>(resolve => { releaseQueue = resolve; });
  await previous;
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  nextRequestAt = Date.now() + 1100;
  try {
    const response = await fetch(`https://musicbrainz.org/ws/2${path}${path.includes("?") ? "&" : "?"}fmt=json`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`MusicBrainz error ${response.status}`);
    return response.json();
  } finally { releaseQueue(); }
}

const artists = (release: MusicBrainzRelease) => release["artist-credit"]?.map(artist => ({ name: artist.name })) || [{ name: "Unknown artist" }];
const artworkUrl = (release: MusicBrainzRelease, size: 250 | 1200) => {
  const groupId = release["release-group"]?.id;
  return groupId ? `https://coverartarchive.org/release-group/${groupId}/front-${size}` : `https://coverartarchive.org/release/${release.id}/front-${size}`;
};

function toAlbum(release: MusicBrainzRelease, full = false): CatalogAlbum {
  const tracks: SpotifyTrack[] = (release.media || []).flatMap((medium, mediumIndex) => (medium.tracks || []).map((track, index) => ({
    id: track.recording?.id || track.id || `${release.id}-${mediumIndex}-${index}`,
    name: track.title || track.recording?.title || `Track ${index + 1}`,
    track_number: track.position || Number.parseInt(track.number || "", 10) || index + 1,
    disc_number: medium.position || mediumIndex + 1,
    duration_ms: track.length || 0,
  })));
  return {
    id: `mb:${release.id}`,
    name: release.title,
    album_type: release["release-group"]?.["primary-type"] || "Album",
    artists: artists(release),
    images: [{ url: artworkUrl(release, 1200), width: 1200, height: 1200 }, { url: artworkUrl(release, 250), width: 250, height: 250 }],
    release_date: release.date || "",
    label: release["label-info"]?.find(item => item.label?.name)?.label?.name,
    genres: [],
    total_tracks: tracks.length,
    tracks: { items: tracks },
    catalogSource: "musicbrainz",
    ...(full ? {} : { total_tracks: 0 }),
  };
}

export async function searchCatalog(query: string): Promise<CatalogAlbum[]> {
  if (!query.trim()) return [];
  const data = await musicBrainz<{ releases?: MusicBrainzRelease[] }>(`/release/?query=${encodeURIComponent(query.trim())}&limit=10`);
  const unique = new Map<string, CatalogAlbum>();
  for (const release of data.releases || []) {
    const key = `${release.title.toLowerCase()}|${artists(release)[0]?.name.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, toAlbum(release));
  }
  return [...unique.values()].slice(0, 8);
}

export async function loadCatalogAlbum(id: string, options: { cacheArtwork?: boolean } = {}): Promise<CatalogAlbum | null> {
  const cached = await getCachedAlbum(id);
  if (cached?.tracks.items.length) return cached;
  if (!id.startsWith("mb:")) return cached;
  const releaseId = id.slice(3);
  const release = await musicBrainz<MusicBrainzRelease>(`/release/${encodeURIComponent(releaseId)}?inc=recordings+artists+labels+release-groups`);
  const album = toAlbum(release, true);
  return cacheAlbum(options.cacheArtwork === false ? album : await cacheCover(album));
}

export async function resolveCurrentlyPlaying(name: string, artist: string, spotifyAlbumId: string) {
  const cached = (await getCachedAlbumsFromDatabase()).find(album => album.spotifyAlbumId === spotifyAlbumId);
  if (cached) return cached;
  let results = await searchCatalog(`release:${JSON.stringify(name)} AND artist:${JSON.stringify(artist)}`);
  if (!results.length) results = await searchCatalog(`${name} ${artist}`);
  const match = results[0];
  if (!match) return null;
  const full = await loadCatalogAlbum(match.id, { cacheArtwork: false });
  if (!full) return null;
  full.spotifyAlbumId = spotifyAlbumId;
  return cacheAlbum(full);
}

async function getCachedAlbumsFromDatabase(): Promise<CatalogAlbum[]> {
  try {
    const db = await openDb();
    const result = await new Promise<CatalogAlbum[]>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  } catch { return []; }
}
