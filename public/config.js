// Device-local Spotify configuration. These values are safe to expose in a PKCE app.
window.MUSIC_FRAME_CONFIG = {
  spotifyClientId: "e1622cbcf77d4bca9b9a3cd7ade486f7",
  redirectUri: window.location.origin + window.location.pathname,
  standbyAlbumIds: [
    "1ATL5GLyefJaxhQzSPVrLX",
    "4LH4d3cOWNNsVw41Gqt2kv",
    "6mUdeDZCsExyJLMdAfDuwh",
  ],
  // Spotify is used only for the currently-playing check.
  pollIntervalMs: 5000,
  carouselIntervalMs: 30000,
};
