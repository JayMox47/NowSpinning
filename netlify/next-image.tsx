import type { ImgHTMLAttributes } from "react";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
  src: string;
  width?: number | `${number}`;
  height?: number | `${number}`;
  fill?: boolean;
  sizes?: string;
  unoptimized?: boolean;
};

export default function Image({ fill, unoptimized: _unoptimized, style, alt, ...props }: ImageProps) {
  void _unoptimized;
  return (
    // This compatibility component preserves Next Image's API in the static Netlify build.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt || ""}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style}
    />
  );
}
