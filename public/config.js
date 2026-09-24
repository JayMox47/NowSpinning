// Device-local Spotify configuration. These values are safe to expose in a PKCE app.
window.MUSIC_FRAME_CONFIG = {
  spotifyClientId: "e1622cbcf77d4bca9b9a3cd7ade486f7",
  redirectUri: "https://music.jonathanmox.com/",
  // Omit standbyAlbumIds to use the built-in collection. Set an array to override it.
  // Spotify is used only for the currently-playing check.
  pollIntervalMs: 5000,
  carouselIntervalMs: 30000,
};
