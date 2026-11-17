import type { SpotifyAlbum } from "./spotify";

// Keep the data, rather than a single "resolved" ID that can outlive the display.
export function createLiveAlbumLoader(
  primary: (album: SpotifyAlbum) => Promise<SpotifyAlbum | null>,
  fallback: (album: SpotifyAlbum) => Promise<SpotifyAlbum | null>,
  { timeoutMs = 15000, retryMs = 15000 } = {},
) {
  const albums = new Map<string, SpotifyAlbum>();
  const pending = new Map<string, Promise<SpotifyAlbum | null>>();
  const retryAt = new Map<string, number>();
  const bounded = async (request: () => Promise<SpotifyAlbum | null>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(request),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
      ]);
    } catch { return null; }
    finally { clearTimeout(timer); }
  };
  const usable = (album: SpotifyAlbum | null) => Boolean(album?.tracks?.items?.length);
  return {
    get: (id: string) => albums.get(id),
    load(album: SpotifyAlbum): Promise<SpotifyAlbum | null> {
      const cached = albums.get(album.id);
      if (cached) return Promise.resolve(cached);
      const active = pending.get(album.id);
      if (active) return active;
      if (Date.now() < (retryAt.get(album.id) || 0)) return Promise.resolve(null);
      const request = (async () => {
        let full = usable(album) ? album : await bounded(() => primary(album));
        if (!usable(full)) full = await bounded(() => fallback(album));
        if (!full || !usable(full)) {
          retryAt.set(album.id, Date.now() + retryMs);
          return null;
        }
        // Fallback catalogs use their own IDs; playback identity stays Spotify's.
        const result = { ...full, id: album.id, images: album.images?.length ? album.images : full.images };
        albums.set(album.id, result);
        retryAt.delete(album.id);
        return result;
      })().finally(() => pending.delete(album.id));
      pending.set(album.id, request);
      return request;
    },
  };
}
