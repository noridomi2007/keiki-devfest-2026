import { useEffect, useState, type ReactNode } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';

export interface ChapterItem {
  id: string;
  roman: string;
  label: string;
}

/**
 * Slim GPU-accelerated reading progress thread pinned beneath the top bar.
 */
export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 260,
    damping: 34,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX, transformOrigin: '0% 50%' }}
      className="pointer-events-none fixed top-0 right-0 left-0 z-50 h-[2.5px] bg-gradient-to-r from-[#2E2396] via-[#4F46E5] to-[#0B6E54]"
    />
  );
}

/**
 * Shopify Editions-inspired compact Roman-numeral chapter rail pinned in the left desktop gutter.
 * Zero collision with centered max-w-6xl content even at 1280px viewports.
 */
export function ScrollChapterRail({
  chapters,
  onNavigate,
}: {
  chapters: ChapterItem[];
  onNavigate: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string>(chapters[0]?.id || 'hero-top');
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 260);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-28% 0px -52% 0px', threshold: 0.05 },
    );

    for (const ch of chapters) {
      const el = document.getElementById(ch.id);
      if (el) observer.observe(el);
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [chapters]);

  if (!visible) return null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Mục lục chương"
      className="fixed top-1/2 left-3 z-40 hidden -translate-y-1/2 flex-col gap-1.5 rounded-2xl border border-border bg-white/95 p-1.5 shadow-sm backdrop-blur min-[1320px]:flex"
    >
      {chapters.map((ch) => {
        const isActive = activeId === ch.id;
        return (
          <button
            key={ch.id}
            type="button"
            title={`${ch.roman}. ${ch.label}`}
            aria-label={`${ch.roman}. ${ch.label}`}
            onClick={() => onNavigate(ch.id)}
            className={`group relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl font-mono text-xs font-bold transition-colors ${
              isActive ? 'text-white' : 'text-[#475569] hover:text-[#111625]'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="chapter-rail-active"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-xl bg-[#2E2396]"
              />
            )}
            <span className="relative z-10">{ch.roman}</span>
            <span className="pointer-events-none absolute left-11 hidden rounded-lg border border-border bg-[#111625] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white shadow-md group-hover:block">
              {ch.roman}. {ch.label}
            </span>
          </button>
        );
      })}
    </motion.aside>
  );
}

/**
 * Masked upward typography reveal inspired by Lusion & Linear.
 * Animates pure transform inside an overflow-hidden mask (zero layout shift).
 */
export function MaskedLine({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <span className={`block overflow-hidden pb-0.5 ${className}`}>
      <motion.span
        initial={{ y: '100%', opacity: 1 }}
        animate={{ y: '0%', opacity: 1 }}
        transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
        className="block will-change-transform"
      >
        {children}
      </motion.span>
    </span>
  );
}

/**
 * GPU-composited gradual scroll entrance with smooth spring-like deceleration and micro-scale.
 * Ensures sections and sub-cards appear progressively as the user scrolls down.
 */
export function ScrollReveal({
  children,
  delay = 0,
  y = 32,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.14 }}
      transition={{ duration: 0.62, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`will-change-transform ${className}`}
    >
      {children}
    </motion.div>
  );
}
