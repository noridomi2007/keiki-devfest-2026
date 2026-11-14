interface KeikiMarkProps {
  className?: string;
  variant?: 'default' | 'light' | 'mono';
}

interface KeikiLogoProps {
  className?: string;
  markClassName?: string;
  variant?: 'default' | 'dark' | 'mono';
  showBadge?: boolean;
}

/**
 * Custom geometric Voice-to-Ledger "K" emblem for Keiki (Option 3 brand system).
 * Exact 16x20 geometric construction centered inside a 36x36 Sovereign Indigo squircle.
 */
export function KeikiMark({ className = 'h-9 w-9', variant = 'default' }: KeikiMarkProps) {
  const isMono = variant === 'mono';
  const isLight = variant === 'light';

  const containerFill = isMono ? '#111625' : isLight ? '#FFFFFF' : '#2E2396';
  const emeraldFill = isMono ? '#FFFFFF' : isLight ? '#0B6E54' : '#10B981';
  const contrastLegFill = isMono ? '#FFFFFF' : isLight ? '#111625' : '#FFFFFF';

  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        width="36"
        height="36"
        rx="9"
        fill={containerFill}
        stroke={isLight ? '#D5DCE8' : undefined}
        strokeWidth={isLight ? 1 : undefined}
      />
      {/* Upper vertical ledger spine */}
      <path d="M10 8H14.2V15.25L10 20.5V8Z" fill={emeraldFill} />
      {/* Diagonal AI voice-to-ledger pulse ribbon */}
      <path d="M10 22.375L21.5 8H26L10 28V22.375Z" fill={emeraldFill} />
      {/* Lower-left ledger foot triangle */}
      <path d="M11.45 28L14.2 24.56V28H11.45Z" fill={emeraldFill} />
      {/* Precision white accounting leg */}
      <path d="M16.6 21.85L19 18.85L26 28H21.3L16.6 21.85Z" fill={contrastLegFill} />
    </svg>
  );
}

/**
 * Horizontal brand lockup combining KeikiMark with geometric Plus Jakarta Sans wordmark.
 */
export function KeikiLogo({
  className = '',
  markClassName = 'h-9 w-9 shrink-0',
  variant = 'default',
  showBadge = false,
}: KeikiLogoProps) {
  const markVariant = variant === 'mono' ? 'mono' : 'default';
  const wordmarkColor = variant === 'dark' ? 'text-white' : 'text-[#111625]';
  const badgeColor = variant === 'dark' ? 'text-indigo-200' : 'text-[#2E2396]';

  return (
    <div className={`inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap ${className}`}>
      <KeikiMark className={markClassName} variant={markVariant} />
      <div className="flex items-baseline gap-2">
        <span className={`font-heading text-lg font-extrabold tracking-tight ${wordmarkColor}`}>
          Keiki
        </span>
        {showBadge && (
          <span className={`hidden font-mono text-xs font-semibold sm:inline ${badgeColor}`}>
            TT 152/2025
          </span>
        )}
      </div>
    </div>
  );
}
