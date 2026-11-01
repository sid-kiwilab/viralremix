export function LogoMark() {
  return (
    <svg
      className="logo-mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.25" opacity="0.28" />
      <path
        d="M12 3.75 A8.25 8.25 0 1 1 5.1 17.15"
        strokeLinecap="round"
      />
      <path
        d="M5.1 17.15 L6.85 16.35 M5.1 17.15 L6.25 18.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none" />
    </svg>
  );
}
