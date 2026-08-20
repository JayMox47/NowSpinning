import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MusicPoster from "../app/MusicPoster";
import "../app/globals.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // The display remains fully usable if registration is unavailable.
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MusicPoster />
  </StrictMode>,
);
