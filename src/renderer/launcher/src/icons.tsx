/** Line icons ported from the Clay Launcher design's inline SVGs. */

export function SunCompassIcon({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </svg>
  )
}

export function LinkIcon({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
      <path d="M9.5 14.5l5-5" />
      <path d="M12 6.5l1.3-1.3a4 4 0 0 1 5.7 5.7L17.7 12M12 17.5l-1.3 1.3a4 4 0 0 1-5.7-5.7L6.3 12" />
    </svg>
  )
}

export function NewspaperIcon({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
      <path d="M4 5h12.5v14H6a2 2 0 0 1-2-2z" />
      <path d="M16.5 9H20v8a2 2 0 0 1-3.5 1.3" />
      <path d="M7.5 9h5.5M7.5 12.5h5.5M7.5 16h3.5" />
    </svg>
  )
}

export function PhotoIcon({ size = 60 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8" cy="9" r="1.5" />
      <path d="m3 17 5-5 4 4 4-6 5 7" />
    </svg>
  )
}

export function MusicIcon({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" style={{ maxWidth: '80%', maxHeight: '80%' }}>
      <path d="M25 46V16l27-6v30M25 24l27-6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="17" cy="47" rx="9" ry="7" fill="currentColor" />
      <ellipse cx="44" cy="41" rx="9" ry="7" fill="currentColor" />
    </svg>
  )
}

export function PhoneIcon({ size = 48, color = '#BC3A36' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
      <path d="M5 4h3.5l1.5 4.5-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" />
    </svg>
  )
}
