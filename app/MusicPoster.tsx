"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { getConfig } from "./config";
import { beginSpotifyLogin, completeSpotifyLogin, disconnectSpotify, getAlbum, getCurrentlyPlaying, isSpotifyConnected, searchAlbums, type SpotifyAlbum } from "./spotify";

const demoAlbum: SpotifyAlbum = {
  id: "demo",
  name: "Chromatic Nocturne",
  artists: [{ name: "The Midnight Assembly" }],
  images: [],
  release_date: "1978-09-22",
  label: "Arcline Records",
  genres: ["Ambient soul"],
  total_tracks: 10,
  tracks: { items: ["First Light", "Soft Geometry", "Mercury Glass", "June in Reverse", "Still Life", "Afterimage", "Blue Hour", "Inner Sleeve", "Low Orbit", "Chromatic Nocturne"].map((name, i) => ({ id: String(i), name, track_number: i + 1, disc_number: 1, duration_ms: 0 })) },
};

type DisplayMode = "live" | "standby" | "pinned";

const AlbumArt = ({ album }: { album: SpotifyAlbum }) => {
  const src = album.images?.[0]?.url;
  if (src) return <Image className="cover-image" src={src} alt={`${album.name} album cover`} fill sizes="(max-width: 720px) 92vw, 720px" unoptimized crossOrigin="anonymous" />;
  return (
    <div className="demo-cover" aria-label="Abstract placeholder album artwork">
      <span className="orbit orbit-one" /><span className="orbit orbit-two" />
      <span className="demo-mark">CN</span><span className="demo-caption">ARCLINE • 078</span>
    </div>
  );
};

export default function MusicPoster() {
  const [album, setAlbum] = useState<SpotifyAlbum>(demoAlbum);
  const [mode, setMode] = useState<DisplayMode>("standby");
  const [connected, setConnected] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyAlbum[]>([]);
  const [searching, setSearching] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [notice, setNotice] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const pinned = useRef<SpotifyAlbum | null>(null);
  const standbyIndex = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = useMemo(() => typeof window === "undefined" ? null : getConfig(), []);

  const updateAccent = useCallback((candidate: SpotifyAlbum) => {
    const url = candidate.images?.[0]?.url;
    if (!url) { document.documentElement.style.setProperty("--accent", "#d36135"); return; }
    const image = new Image(); image.crossOrigin = "anonymous"; image.src = url;
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 24;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
        ctx.drawImage(image, 0, 0, 24, 24); const pixels = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < pixels.length; i += 16) { const lum = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3; if (lum > 28 && lum < 235) { r += pixels[i]; g += pixels[i+1]; b += pixels[i+2]; count++; } }
        if (count) document.documentElement.style.setProperty("--accent", `rgb(${r/count}, ${g/count}, ${b/count})`);
      } catch { /* A remote image may disallow canvas reads; keep the current accent. */ }
    };
  }, []);

  const showAlbum = useCallback((next: SpotifyAlbum, nextMode: DisplayMode) => { setAlbum(next); setMode(nextMode); updateAccent(next); }, [updateAccent]);

  const showStandby = useCallback(async () => {
    if (!config || !connected || !config.standbyAlbumIds.length) { showAlbum(demoAlbum, "standby"); return; }
    const id = config.standbyAlbumIds[standbyIndex.current++ % config.standbyAlbumIds.length];
    try { const next = await getAlbum(id, config); if (next) showAlbum(next, "standby"); } catch { showAlbum(demoAlbum, "standby"); }
  }, [config, connected, showAlbum]);

  useEffect(() => {
    if (!config) return;
    completeSpotifyLogin(config).catch(() => setNotice("Spotify sign-in could not be completed.")).finally(() => setConnected(isSpotifyConnected()));
  }, [config]);

  useEffect(() => {
    if (!config) return;
    let disposed = false;
    const poll = async () => {
      if (pinned.current || !isSpotifyConnected()) return;
      try {
        const playing = await getCurrentlyPlaying(config);
        const current = playing?.item?.album;
        if (!disposed && playing?.is_playing && current) {
          const full = current.tracks?.items?.length ? current : await getAlbum(current.id, config);
          if (full) showAlbum(full, "live");
        } else if (!disposed && mode === "live") await showStandby();
      } catch { if (!disposed) setConnected(isSpotifyConnected()); }
    };
    poll(); const interval = window.setInterval(poll, config.pollIntervalMs);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [config, mode, showAlbum, showStandby]);

  useEffect(() => {
    if (!config) return;
    const interval = window.setInterval(() => { if (!pinned.current && mode !== "live") showStandby(); }, config.carouselIntervalMs);
    return () => window.clearInterval(interval);
  }, [config, mode, showStandby]);

  useEffect(() => {
    const reveal = () => { setControlsVisible(true); if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => { if (!drawerOpen) setControlsVisible(false); }, 3000); };
    ["mousemove", "touchstart", "keydown"].forEach(event => window.addEventListener(event, reveal, { passive: true })); reveal();
    return () => ["mousemove", "touchstart", "keydown"].forEach(event => window.removeEventListener(event, reveal));
  }, [drawerOpen]);

  useEffect(() => {
    if (!config) return;
    const timer = setTimeout(async () => {
      if (!query.trim()) { setResults([]); return; }
      setSearching(true);
      try { setResults(await searchAlbums(query, config)); } catch { setNotice("Search is temporarily unavailable."); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [config, query]);

  const toggleFullscreen = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  const toggleConnection = () => {
    if (!config) return;
    if (connected) { disconnectSpotify(); setConnected(false); pinned.current = null; showAlbum(demoAlbum, "standby"); }
    else if (!config.spotifyClientId || config.spotifyClientId.includes("YOUR_")) setNotice("Add your Spotify Client ID in public/config.js first.");
    else beginSpotifyLogin(config);
  };
  const pinAlbum = (chosen: SpotifyAlbum) => { pinned.current = chosen; setIsPinned(true); showAlbum(chosen, "pinned"); setDrawerOpen(false); };
  const resumeAuto = () => { pinned.current = null; setIsPinned(false); setDrawerOpen(false); showStandby(); };
  const tracks = album.tracks?.items || [];
  const year = album.release_date?.slice(0, 4) || "—";
  const detail = album.genres?.[0] || album.label || album.album_type || "Album";

  return (
    <main className={`kiosk ${controlsVisible || drawerOpen ? "controls-active" : "controls-hidden"}`}>
      <div className="ambient" />
      <header className="topline">
        <div className="brand"><span className="brand-dot" /> NOW SPINNING <span className="edition">FRAME 01</span></div>
        <div className="status"><span className={`signal ${mode}`} /> {mode === "live" ? "LIVE FROM SPOTIFY" : mode === "pinned" ? "MANUAL SELECTION" : "STANDBY EDITION"}</div>
      </header>

      <section className="poster" aria-live="polite">
        <div className="art-wrap"><AlbumArt album={album} /><div className="vinyl-rings" /></div>
        <section className="album-info">
          <div className="title-block"><p className="eyebrow">ALBUM / {year}</p><h1>{album.name}</h1><p className="artist">{album.artists.map(a => a.name).join(", ")}</p></div>
          <dl className="metadata"><div><dt>Released</dt><dd>{year}</dd></div><div><dt>Genre / Label</dt><dd>{detail}</dd></div><div><dt>Format</dt><dd>{album.total_tracks || tracks.length} tracks</dd></div></dl>
        </section>
        <section className="track-section">
          <div className="track-heading"><span>TRACK LISTING</span><span>{String(tracks.length).padStart(2, "0")} CUTS</span></div>
          <ol className="tracklist">{tracks.map((track, index) => <li key={`${track.id}-${index}`}><span className="track-number">{String(track.track_number || index + 1).padStart(2, "0")}</span><span>{track.name}</span></li>)}</ol>
        </section>
      </section>

      <nav className="controls" aria-label="Display controls">
        <button onClick={() => setDrawerOpen(true)} aria-label="Open album selector"><span>＋</span> SELECT ALBUM</button>
        <button onClick={toggleConnection}><span className="spotify-glyph">●</span> {connected ? "DISCONNECT" : "CONNECT SPOTIFY"}</button>
        <button className="icon-button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">⛶</button>
      </nav>

      {notice && <button className="notice" onClick={() => setNotice("")}>{notice} <span>×</span></button>}
      <button className={`drawer-backdrop ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} aria-label="Close album selector" />
      <aside className={`drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="drawer-head"><div><p className="eyebrow">MANUAL OVERRIDE</p><h2>Choose a record</h2></div><button className="close" onClick={() => setDrawerOpen(false)} aria-label="Close selector">×</button></div>
        <label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder={connected ? "Search Spotify albums…" : "Connect Spotify to search…"} disabled={!connected} /></label>
        {isPinned && <button className="resume" onClick={resumeAuto}>Resume automatic display <span>→</span></button>}
        <div className="results">
          {searching && <p className="empty">Searching the shelves…</p>}
          {!searching && !query && <p className="empty">Search by album or artist, then pin a record to keep it on screen.</p>}
          {!searching && query && !results.length && <p className="empty">No albums found.</p>}
          {results.map(item => <button className="result" key={item.id} onClick={async () => { if (!config) return; const full = await getAlbum(item.id, config); if (full) pinAlbum(full); }}><span className="result-art">{item.images?.[2]?.url ? <Image src={item.images[2].url} alt="" width={54} height={54} unoptimized /> : "♪"}</span><span><strong>{item.name}</strong><small>{item.artists.map(a => a.name).join(", ")} · {item.release_date?.slice(0,4)}</small></span><b>＋</b></button>)}
        </div>
        <footer className="drawer-footer"><span className={`signal ${connected ? "live" : "standby"}`} /> {connected ? "SPOTIFY CONNECTED" : "SPOTIFY NOT CONNECTED"}</footer>
      </aside>
    </main>
  );
}
