import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MusicPoster from "../app/MusicPoster";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MusicPoster />
  </StrictMode>,
);
