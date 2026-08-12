// Device-local Spotify configuration. These values are safe to expose in a PKCE app.
window.MUSIC_FRAME_CONFIG = {
  spotifyClientId: "YOUR_SPOTIFY_CLIENT_ID",
  redirectUri: window.location.origin + window.location.pathname,
  standbyAlbumIds: [
    "1ATL5GLyefJaxhQzSPVrLX",
    "4LH4d3cOWNNsVw41Gqt2kv",
    "6mUdeDZCsExyJLMdAfDuwh",
  ],
  pollIntervalMs: 5000,
  carouselIntervalMs: 30000,
};
