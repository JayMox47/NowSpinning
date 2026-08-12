// Device-local Spotify configuration. These values are safe to expose in a PKCE app.
window.MUSIC_FRAME_CONFIG = {
  spotifyClientId: "31a943e17e4945b088199834bae18121",
  redirectUri: window.location.origin + window.location.pathname,
  standbyAlbumIds: [
    "1ATL5GLyefJaxhQzSPVrLX",
    "4LH4d3cOWNNsVw41Gqt2kv",
    "6mUdeDZCsExyJLMdAfDuwh",
  ],
  // Spotify Development Mode has a shared request quota; 15s is responsive without exhausting it.
  pollIntervalMs: 15000,
  carouselIntervalMs: 30000,
};
