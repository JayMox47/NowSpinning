export type MusicFrameConfig = {
  spotifyClientId: string;
  redirectUri: string;
  standbyAlbumIds: string[];
  pollIntervalMs: number;
  carouselIntervalMs: number;
};

declare global { interface Window { MUSIC_FRAME_CONFIG?: Partial<MusicFrameConfig> } }

export const getConfig = (): MusicFrameConfig => ({
  spotifyClientId: window.MUSIC_FRAME_CONFIG?.spotifyClientId || "",
  redirectUri: window.MUSIC_FRAME_CONFIG?.redirectUri || window.location.origin + window.location.pathname,
  standbyAlbumIds: window.MUSIC_FRAME_CONFIG?.standbyAlbumIds || [],
  pollIntervalMs: window.MUSIC_FRAME_CONFIG?.pollIntervalMs || 5000,
  carouselIntervalMs: window.MUSIC_FRAME_CONFIG?.carouselIntervalMs || 30000,
});
