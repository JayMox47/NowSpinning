"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { getConfig, type MusicFrameConfig } from "./config";
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
type DrawerView = "rotation" | "pin";

const ALBUMS_KEY = "music-frame.standby-albums";
const INTERVAL_KEY = "music-frame.rotation-interval";

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
  const [drawerView, setDrawerView] = useState<DrawerView>("rotation");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyAlbum[]>([]);
  const [searching, setSearching] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [notice, setNotice] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [standbyIds, setStandbyIds] = useState<string[]>([]);
  const [standbyAlbums, setStandbyAlbums] = useState<SpotifyAlbum[]>([]);
  const [rotationMs, setRotationMs] = useState(30000);
  const [config, setConfig] = useState<MusicFrameConfig | null>(null);
  const pinned = useRef<SpotifyAlbum | null>(null);
  const standbyIndex = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const loadConfig = () => {
      const next = getConfig();
      if (next.spotifyClientId || attempts++ >= 20) setConfig(next);
      else timer = setTimeout(loadConfig, 100);
    };
    timer = setTimeout(loadConfig, 0);
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  const updateAccent = useCallback((candidate: SpotifyAlbum) => {
    const url = candidate.images?.[0]?.url;
    if (!url) return;
    const image = new window.Image(); image.crossOrigin = "anonymous"; image.src = url;
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 36;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
        ctx.drawImage(image, 0, 0, 36, 36);
        const pixels = ctx.getImageData(0, 0, 36, 36).data;
        const buckets = new Map<string, { r: number; g: number; b: number; count: number; saturation: number }>();
        for (let i = 0; i < pixels.length; i += 16) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          const max = Math.max(r, g, b), min = Math.min(r, g, b), saturation = max - min;
          const key = `${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)}`;
          const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0, saturation: 0 };
          bucket.r += r; bucket.g += g; bucket.b += b; bucket.count++; bucket.saturation += saturation;
          buckets.set(key, bucket);
        }
        const palette = [...buckets.values()].map(color => ({
          r: Math.round(color.r / color.count), g: Math.round(color.g / color.count), b: Math.round(color.b / color.count),
          score: color.count * (1 + color.saturation / color.count / 90),
        })).sort((a, b) => b.score - a.score);
        const first = palette[0];
        const second = palette.find(color => Math.hypot(color.r - first.r, color.g - first.g, color.b - first.b) > 75) || palette[1] || first;
        const soften = (color: typeof first) => `rgb(${Math.round(color.r * .62)}, ${Math.round(color.g * .62)}, ${Math.round(color.b * .62)})`;
        const root = document.documentElement;
        root.style.setProperty("--color-one", soften(first));
        root.style.setProperty("--color-two", soften(second));
        root.style.setProperty("--accent", `rgb(${second.r}, ${second.g}, ${second.b})`);
      } catch { /* A remote image may disallow canvas reads; keep the current accent. */ }
    };
  }, []);

  const showAlbum = useCallback((next: SpotifyAlbum, nextMode: DisplayMode) => { setAlbum(next); setMode(nextMode); updateAccent(next); }, [updateAccent]);

  const showStandby = useCallback(async () => {
    setCurrentTrackId(null);
    if (!config || !connected || !standbyIds.length) { showAlbum(demoAlbum, "standby"); return; }
    const id = standbyIds[standbyIndex.current++ % standbyIds.length];
    try { const next = await getAlbum(id, config); if (next) showAlbum(next, "standby"); } catch { showAlbum(demoAlbum, "standby"); }
  }, [config, connected, showAlbum, standbyIds]);

  useEffect(() => {
    if (!config) return;
    Promise.resolve().then(() => {
      try {
        const savedAlbums = JSON.parse(localStorage.getItem(ALBUMS_KEY) || "null");
        setStandbyIds(Array.isArray(savedAlbums) ? savedAlbums : config.standbyAlbumIds);
        const savedInterval = Number(localStorage.getItem(INTERVAL_KEY));
        setRotationMs(savedInterval >= 10000 ? savedInterval : config.carouselIntervalMs);
      } catch { setStandbyIds(config.standbyAlbumIds); }
    });
    completeSpotifyLogin(config).catch(() => setNotice("Spotify sign-in could not be completed.")).finally(() => setConnected(isSpotifyConnected()));
  }, [config]);

  useEffect(() => {
    if (!config || !connected || !standbyIds.length) { Promise.resolve().then(() => setStandbyAlbums([])); return; }
    let disposed = false;
    const loadAlbums = async () => {
      const items: SpotifyAlbum[] = [];
      for (const id of standbyIds) {
        if (disposed) return;
        const item = await getAlbum(id, config).catch(() => null);
        if (item) items.push(item);
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      if (!disposed) setStandbyAlbums(items);
    };
    loadAlbums();
    return () => { disposed = true; };
  }, [config, connected, standbyIds]);

  useEffect(() => {
    if (!config) return;
    let disposed = false;
    const poll = async () => {
      if (pinned.current || !isSpotifyConnected()) return;
      try {
        const playing = await getCurrentlyPlaying(config);
        const current = playing?.item?.album;
        if (!disposed && playing?.is_playing && current) {
          setCurrentTrackId(playing.item?.id || null);
          const full = current.tracks?.items?.length ? current : await getAlbum(current.id, config);
          if (full) showAlbum(full, "live");
        } else if (!disposed) {
          setCurrentTrackId(null);
          if (mode === "live") await showStandby();
        }
      } catch { if (!disposed) setConnected(isSpotifyConnected()); }
    };
    poll(); const interval = window.setInterval(poll, Math.max(config.pollIntervalMs, 15000));
    return () => { disposed = true; window.clearInterval(interval); };
  }, [config, mode, showAlbum, showStandby]);

  useEffect(() => {
    if (!config) return;
    const interval = window.setInterval(() => { if (!pinned.current && mode !== "live") showStandby(); }, rotationMs);
    return () => window.clearInterval(interval);
  }, [config, mode, rotationMs, showStandby]);

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
  const saveStandbyIds = (ids: string[]) => { setStandbyIds(ids); localStorage.setItem(ALBUMS_KEY, JSON.stringify(ids)); };
  const addToRotation = (chosen: SpotifyAlbum) => {
    if (standbyIds.includes(chosen.id)) { setNotice("That album is already in the rotation."); return; }
    saveStandbyIds([...standbyIds, chosen.id]); setStandbyAlbums(current => [...current, chosen]); setQuery(""); setResults([]);
  };
  const removeFromRotation = (id: string) => saveStandbyIds(standbyIds.filter(albumId => albumId !== id));
  const changeRotation = (milliseconds: number) => { setRotationMs(milliseconds); localStorage.setItem(INTERVAL_KEY, String(milliseconds)); };
  const tracks = album.tracks?.items || [];
  const posterStyle = { "--track-rows": Math.ceil(tracks.length / 2) } as CSSProperties;
  const year = album.release_date?.slice(0, 4) || "—";
  const detail = album.genres?.[0] || album.label || album.album_type || "Album";

  return (
    <main className={`kiosk ${controlsVisible || drawerOpen ? "controls-active" : "controls-hidden"}`}>
      <section className="poster" aria-live="polite" style={posterStyle}>
        <div className="art-wrap"><AlbumArt album={album} /></div>
        <section className="album-info">
          <div className="title-block"><h1>{album.name}</h1><p className="artist">{album.artists.map(a => a.name).join(", ")}</p></div>
          <p className="album-meta">{year} <span>·</span> {detail}</p>
        </section>
        <section className="track-section">
          <div className="track-heading"><span>TRACKS</span><span>{String(tracks.length).padStart(2, "0")}</span></div>
          <ol className="tracklist">{tracks.map((track, index) => <li className={currentTrackId === track.id ? "playing" : ""} key={`${track.id}-${index}`}><span className="track-number">{currentTrackId === track.id ? <span className="playing-glyph" aria-label="Currently playing"><i /><i /><i /></span> : String(track.track_number || index + 1).padStart(2, "0")}</span><span>{track.name}</span></li>)}</ol>
        </section>
      </section>

      <nav className="controls" aria-label="Display controls">
        <button onClick={() => { setDrawerView("rotation"); setDrawerOpen(true); }} aria-label="Open rotation settings"><span>≡</span> ROTATION</button>
        <button onClick={toggleConnection}><span className="spotify-glyph">●</span> {connected ? "DISCONNECT" : "CONNECT SPOTIFY"}</button>
        <button className="icon-button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">⛶</button>
      </nav>

      {notice && <button className="notice" onClick={() => setNotice("")}>{notice} <span>×</span></button>}
      <button className={`drawer-backdrop ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} aria-label="Close album selector" />
      <aside className={`drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="drawer-head"><div><p className="eyebrow">DISPLAY LIBRARY</p><h2>{drawerView === "rotation" ? "Album rotation" : "Pin an album"}</h2></div><button className="close" onClick={() => setDrawerOpen(false)} aria-label="Close selector">×</button></div>
        <div className="drawer-tabs"><button className={drawerView === "rotation" ? "active" : ""} onClick={() => { setDrawerView("rotation"); setQuery(""); }}>Rotation</button><button className={drawerView === "pin" ? "active" : ""} onClick={() => { setDrawerView("pin"); setQuery(""); }}>Manual pin</button></div>
        {drawerView === "rotation" && <div className="frequency"><label htmlFor="rotation-frequency">Change album every</label><select id="rotation-frequency" value={rotationMs} onChange={event => changeRotation(Number(event.target.value))}><option value={15000}>15 seconds</option><option value={30000}>30 seconds</option><option value={60000}>1 minute</option><option value={120000}>2 minutes</option><option value={300000}>5 minutes</option><option value={600000}>10 minutes</option></select></div>}
        {drawerView === "rotation" && <div className="rotation-list">{standbyAlbums.length ? standbyAlbums.map(item => <div className="rotation-item" key={item.id}><span className="result-art">{item.images?.[2]?.url && <Image src={item.images[2].url} alt="" width={54} height={54} unoptimized />}</span><span><strong>{item.name}</strong><small>{item.artists.map(a => a.name).join(", ")}</small></span><button onClick={() => removeFromRotation(item.id)} aria-label={`Remove ${item.name} from rotation`}>×</button></div>) : <p className="empty">Your rotation is empty. Add an album below.</p>}</div>}
        <label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder={connected ? drawerView === "rotation" ? "Add an album…" : "Search Spotify albums…" : "Connect Spotify to search…"} disabled={!connected} /></label>
        {drawerView === "pin" && isPinned && <button className="resume" onClick={resumeAuto}>Resume automatic display <span>→</span></button>}
        <div className="results">
          {searching && <p className="empty">Searching the shelves…</p>}
          {!searching && !query && drawerView === "pin" && <p className="empty">Search by album or artist, then pin a record to keep it on screen.</p>}
          {!searching && query && !results.length && <p className="empty">No albums found.</p>}
          {results.map(item => <button className="result" key={item.id} onClick={async () => { if (drawerView === "rotation") { addToRotation(item); return; } if (!config) return; const full = await getAlbum(item.id, config); if (full) pinAlbum(full); else setNotice("Spotify is temporarily rate-limiting requests. Try again shortly."); }}><span className="result-art">{item.images?.[2]?.url ? <Image src={item.images[2].url} alt="" width={54} height={54} unoptimized /> : "♪"}</span><span><strong>{item.name}</strong><small>{item.artists.map(a => a.name).join(", ")} · {item.release_date?.slice(0,4)}</small></span><b>＋</b></button>)}
        </div>
        <footer className="drawer-footer"><span className={`signal ${connected ? "live" : "standby"}`} /> {connected ? "SPOTIFY CONNECTED" : "SPOTIFY NOT CONNECTED"}</footer>
      </aside>
    </main>
  );
}
