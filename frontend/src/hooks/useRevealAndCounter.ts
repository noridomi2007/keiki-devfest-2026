import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Observe when an element enters the viewport once to trigger subtle reveal motion.
 */
export function useReveal<T extends HTMLElement = HTMLElement>(
  threshold = 0.14
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const rect = node.getBoundingClientRect();
    if (rect.top <= window.innerHeight + 160) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: Math.min(threshold, 0.02), rootMargin: '160px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, threshold]);

  return [ref, visible];
}

/**
 * Smooth cubic ease-out number interpolation starting from visible value.
 */
export function useAnimatedNumber(target: number, active: boolean, durationMs = 550): number {
  const [value, setValue] = useState<number>(() => target);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!active || hasAnimated.current) return;
    hasAnimated.current = true;
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }

    const floorStart = Math.max(0, Math.floor(target * 0.5));
    let frameId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setValue(Math.round(floorStart + (target - floorStart) * eased));
      if (elapsed < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [target, active, durationMs]);

  return value;
}
