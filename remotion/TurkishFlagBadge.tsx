import type { CSSProperties } from "react";

/** Rounded Turkish flag badge (Rosetta-style header), not emoji. */
export function TurkishFlagBadge({
  height = 40,
}: {
  height?: number;
}) {
  const width = Math.round(height * 1.45);
  const style: CSSProperties = {
    width,
    height,
    borderRadius: height * 0.18,
    overflow: "hidden",
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
  };

  return (
    <svg
      viewBox="0 0 145 100"
      width={width}
      height={height}
      style={style}
      aria-hidden
    >
      <rect width="145" height="100" fill="#E30A17" rx="8" />
      <circle cx="54" cy="50" r="24" fill="#ffffff" />
      <circle cx="62" cy="50" r="19" fill="#E30A17" />
      <path
        fill="#ffffff"
        d="M92 50 L86 54.5 L88 47 L82 43 L89.5 43 L92 36 L94.5 43 L102 43 L96 47 L98 54.5 Z"
      />
    </svg>
  );
}
