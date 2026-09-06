export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fidemVert" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9ecb2e" />
          <stop offset="100%" stopColor="#d8c61a" />
        </linearGradient>
        <linearGradient id="fidemTop" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1c8aa0" />
          <stop offset="100%" stopColor="#2aa7b8" />
        </linearGradient>
      </defs>
      <path d="M28 16 H88 L74 32 H42 Z" fill="url(#fidemTop)" />
      <path d="M28 16 L42 32 V88 L28 82 Z" fill="url(#fidemVert)" />
      <path d="M46 56 L62 56 L46 72 Z" fill="#a9c62b" />
      <path d="M64 56 L80 56 L58 78 L46 78 Z" fill="#d8c61a" />
    </svg>
  );
}
