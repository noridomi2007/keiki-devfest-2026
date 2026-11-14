import { vi } from '../i18n/vi';
import { AppIcon } from '@/components/AppIcon';

interface StampProps {
  animate?: boolean;
}

export function Stamp({ animate = true }: StampProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-[#0B6E54] bg-emerald-50/90 px-3 py-2 font-mono text-xs leading-none font-bold tracking-wider text-[#0B6E54] uppercase ring-1 ring-[#0B6E54]/15 ${
        animate ? 'stamp-animate' : '-rotate-4'
      }`}
    >
      <AppIcon name="verified" className="text-sm" />
      {vi.stampText}
    </span>
  );
}
