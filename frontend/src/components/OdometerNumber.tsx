import { AnimatePresence, motion } from 'motion/react';

interface OdometerNumberProps {
  value: string;
  className?: string;
}

/**
 * Mechanical odometer-style vertical digit ticker inspired by Lusion & TasteSkill.
 * Non-digit separators render cleanly inline while changing digits slide along Y with tabular-nums stability.
 */
export function OdometerNumber({ value, className = '' }: OdometerNumberProps) {
  const chars = Array.from(value);

  return (
    <span className={`inline-flex items-baseline tabular-nums ${className}`} aria-label={value}>
      {chars.map((char, idx) => {
        const isDigit = char >= '0' && char <= '9';
        if (!isDigit) {
          return (
            <span key={`sep-${idx}-${char}`} className="inline-block">
              {char === ' ' ? '\u00A0' : char}
            </span>
          );
        }

        return (
          <span
            key={`slot-${idx}`}
            className="relative inline-flex h-[1.18em] min-w-[0.68em] justify-center overflow-y-hidden"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${idx}-${char}`}
                initial={{ y: '75%', opacity: 0.35 }}
                animate={{ y: '0%', opacity: 1 }}
                exit={{ y: '-75%', opacity: 0.35 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="inline-block leading-[1.18em]"
              >
                {char}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}
