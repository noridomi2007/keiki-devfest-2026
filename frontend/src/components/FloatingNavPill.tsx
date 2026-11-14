import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppIcon } from '@/components/AppIcon';

export interface FloatingNavItem {
  id: string;
  roman?: string;
  label: string;
}

interface FloatingNavPillProps {
  items: FloatingNavItem[];
  onNavigate: (id: string) => void;
  onStartDemo: () => void;
}

/**
 * Sticky obsidian floating dock inspired by Awwwards navigation ergonomics.
 * Appears on desktop once scrolled past the main Hero header and tracks active sections.
 */
export function FloatingNavPill({ items, onNavigate, onStartDemo }: FloatingNavPillProps) {
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState<string>(items[0]?.id || 'thu-nghiem');

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 420);
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
      { rootMargin: '-32% 0px -48% 0px', threshold: 0.05 },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [items]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 left-1/2 z-50 hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-700/80 bg-[#111625]/95 p-1.5 text-white shadow-xl backdrop-blur-md lg:flex"
        >
          <button
            type="button"
            onClick={scrollToTop}
            title="Lên đầu trang"
            aria-label="Lên đầu trang"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-slate-800 text-slate-200 transition hover:bg-[#2E2396] hover:text-white"
          >
            <AppIcon name="arrow_up" className="text-sm" />
          </button>

          <div className="flex items-center gap-0.5 px-1">
            {items.map((item) => {
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`relative cursor-pointer rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                    isActive ? 'text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="floating-nav-pill-active"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-full bg-white/15"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap">
                    {item.roman && (
                      <span className="font-mono text-xs text-indigo-300">{item.roman}.</span>
                    )}
                    <span>{item.label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onStartDemo}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[#2E2396] px-4 text-xs font-bold text-white transition hover:bg-[#3A2EB5]"
          >
            <span>Mở sổ ngay</span>
            <AppIcon name="arrow_forward" className="text-xs" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
