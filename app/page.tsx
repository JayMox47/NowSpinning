import type { Metadata } from "next";
import MusicPoster from "./MusicPoster";

export const metadata: Metadata = {
  title: "Now Spinning",
  description: "A gallery-scale Spotify album display for digital frames.",
};

export default function Home() {
  return <MusicPoster />;
}
