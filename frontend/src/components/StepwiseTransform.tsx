import { useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from 'motion/react';
import { AppIcon } from '@/components/AppIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Stamp } from './Stamp';

interface TransformStage {
  id: 'raw' | 'parsed' | 'audited' | 'ledger';
  roman: string;
  label: string;
  headline: string;
  summary: string;
  badgeText: string;
  badgeTone: 'outline' | 'secondary' | 'emerald';
}

const STAGES: TransformStage[] = [
  {
    id: 'raw',
    roman: 'I',
    label: 'Hóa đơn / Câu nói gốc',
    headline: 'Chủ quán chỉ việc chụp tờ giấy hoặc nói lướt qua loa',
    summary:
      'Không cần ngồi gõ từng món vào bảng Excel. Chụp vội tờ phiếu giao hàng chữ viết tay hay đọc một câu giữa lúc đang bận khách đều được.',
    badgeText: 'Dữ liệu thô tại quầy',
    badgeTone: 'outline',
  },
  {
    id: 'parsed',
    roman: 'II',
    label: 'Nhặt đúng món & tiền',
    headline: 'Tự đọc ra ngày tháng, tên hàng, số lượng và cách trả tiền',
    summary:
      'Những cách nói đời thường như "5 ký", "trăm tám" hay "trả tiền mặt rồi" được đổi thành con số rõ ràng để bạn nhìn phát biết ngay.',
    badgeText: 'Đã xếp gọn thông tin',
    badgeTone: 'secondary',
  },
  {
    id: 'audited',
    roman: 'III',
    label: 'Dò nhầm lẫn trước khi lưu',
    headline: 'Tự nhân lại tiền, so giá tháng trước và tìm bill chuyển khoản trùng',
    summary:
      'Thay vì tin ngay chữ đọc được, phần mềm tự bấm máy tính kiểm tra phép nhân và rà xem sáng giờ có khoản chuyển khoản nào giống hệt chưa.',
    badgeText: 'Kiểm tra chéo 3 bước',
    badgeTone: 'emerald',
  },
  {
    id: 'ledger',
    roman: 'IV',
    label: 'Lên sổ thuế gọn gàng',
    headline: 'Ghi vào đúng cuốn sổ S2d-HKD kèm ảnh gốc để dành cuối quý',
    summary:
      'Xong xuôi mới đóng dấu lưu sổ. Cuối tháng hay khi cần vay vốn ngân hàng, chỉ cần tải tệp Excel sạch sẽ kèm đủ ảnh hóa đơn đi kèm.',
    badgeText: 'Sẵn sàng xuất sổ Excel',
    badgeTone: 'emerald',
  },
];

export function StepwiseTransform() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [stageIdx, setStageIdx] = useState<number>(0);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start 20%', 'end 80%'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 30,
    restDelta: 0.002,
  });

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    if (
      typeof window === 'undefined' ||
      window.innerWidth < 1024 ||
      document.querySelector('.mobile-preview-frame')
    )
      return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const nextIdx = Math.min(STAGES.length - 1, Math.max(0, Math.floor(latest * STAGES.length * 0.999)));
    setStageIdx((prev) => (prev === nextIdx ? prev : nextIdx));
  });

  const current = STAGES[stageIdx];

  const selectStage = (idx: number) => {
    setStageIdx(idx);
    if (
      typeof window === 'undefined' ||
      window.innerWidth < 1024 ||
      document.querySelector('.mobile-preview-frame')
    )
      return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const docTop = rect.top + window.scrollY;
    const scrollable = Math.max(1, track.offsetHeight - window.innerHeight * 0.6);
    const ratio = idx / Math.max(1, STAGES.length - 1);
    window.scrollTo({
      top: Math.round(docTop - window.innerHeight * 0.14 + ratio * scrollable),
      behavior: 'smooth',
    });
  };

  const handleNext = () => {
    const nextIdx = (stageIdx + 1) % STAGES.length;
    selectStage(nextIdx);
  };

  return (
    <div ref={trackRef} className="lg:relative lg:min-h-[210vh]">
      <div className="lg:sticky lg:top-20">
        <Card className="card-interactive min-w-0 gap-0 overflow-hidden border-[#2E2396]/15 py-0 shadow-md shadow-slate-900/5">
          {/* Desktop Scroll-Driven GPU Progress Line */}
          <div className="relative h-1 w-full overflow-hidden bg-slate-100">
            <motion.div
              aria-hidden="true"
              style={{ scaleX: smoothProgress, transformOrigin: '0% 50%' }}
              className="hidden h-full w-full bg-gradient-to-r from-[#2E2396] to-[#0B6E54] lg:block"
            />
            <div
              className="h-full bg-[#2E2396] transition-all duration-300 lg:hidden"
              style={{ width: `${((stageIdx + 1) / STAGES.length) * 100}%` }}
            />
          </div>

          {/* Top 4-Stage Step Selector Bar */}
          <div className="flex flex-col items-stretch gap-2.5 border-b border-border bg-[#F6F8FB] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-6">
            <div
              role="tablist"
              aria-label="Hành trình xử lý một tờ hóa đơn"
              className="grid w-full grid-cols-2 gap-1 rounded-lg bg-slate-200/75 p-1 sm:flex sm:w-auto sm:flex-wrap sm:items-center"
            >
              {STAGES.map((stage, idx) => {
                const active = idx === stageIdx;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectStage(idx)}
                    className={`relative inline-flex min-h-8 cursor-pointer items-center justify-start gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold transition-colors sm:h-8 sm:justify-center sm:px-3 sm:py-0 ${
                      active ? 'text-[#2E2396]' : 'text-[#334155] hover:text-[#111625]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="transform-stage-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                        className="absolute inset-0 rounded-md bg-white shadow-xs"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      <span className="font-mono font-bold text-[#2E2396]">{stage.roman}.</span>
                      <span>{stage.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2">
              <span className="hidden font-mono text-xs text-[#475569] xl:inline">
                Cuộn trang hoặc bấm chọn
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNext}
                className="h-8 w-full text-xs font-bold text-[#2E2396] sm:w-auto"
              >
                <span>{stageIdx === STAGES.length - 1 ? 'Xem lại từ đầu' : 'Bước tiếp theo'}</span>
                <AppIcon name="arrow_forward" className="text-sm" />
              </Button>
            </div>
          </div>

          {/* Asymmetric Split Body */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left: Human Explanation */}
            <div className="flex min-w-0 flex-col justify-between border-b border-border p-6 sm:p-8 lg:col-span-5 lg:border-r lg:border-b-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#2E2396]">
                      BƯỚC {current.roman} / IV
                    </span>
                    <Badge variant={current.badgeTone}>{current.badgeText}</Badge>
                  </div>
                  <h3 className="font-heading text-xl font-extrabold leading-snug text-[#111625]">
                    {current.headline}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#475569]">{current.summary}</p>
                </motion.div>
              </AnimatePresence>

              <div className="mt-6 flex items-center gap-1.5 pt-4">
                {STAGES.map((st, idx) => (
                  <button
                    key={st.id}
                    type="button"
                    aria-label={`Chuyển đến ${st.label}`}
                    onClick={() => selectStage(idx)}
                    className={`h-1.5 cursor-pointer rounded-full transition-all ${
                      idx === stageIdx
                        ? 'w-8 bg-[#2E2396]'
                        : idx < stageIdx
                          ? 'w-4 bg-[#0B6E54]'
                          : 'w-4 bg-slate-200 hover:bg-slate-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Right: Visual State Preview with Progressive Line Staggers */}
            <div className="min-w-0 bg-[#F6F8FB]/75 p-6 sm:p-8 lg:col-span-7">
              <AnimatePresence mode="wait">
                {current.id === 'raw' && (
                  <motion.div
                    key="stage-raw"
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.99 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-4"
                  >
                    <div className="relative overflow-hidden rounded-xl bg-[#FFFDF5] p-5 font-mono text-xs leading-relaxed text-[#111625]">
                      <div aria-hidden="true" className="scan-beam" />
                      <div className="relative z-10 flex items-center justify-between border-b border-dashed border-slate-300 pb-2 text-[#475569]">
                        <span>PHIẾU GIAO HÀNG #104</span>
                        <span>12/11/2026</span>
                      </div>
                      <div className="relative z-10 mt-3 space-y-1.5">
                        <div className="font-bold">Đại lý Cà phê Minh Phát</div>
                        <div>- Ca phe hat rang xay: 5kg x 180k = 900.000</div>
                        <div className="text-[#475569]">Thanh toán: Tiền mặt • Đã giao hàng</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 bg-white px-4 py-3 text-xs text-[#475569]">
                      <AppIcon name="mic" className="mt-0.5 shrink-0 text-base text-[#2E2396]" />
                      <span>
                        Hoặc chỉ cần bấm mic nói nhanh:{' '}
                        <strong className="text-[#111625]">
                          “Mới lấy 5 ký cà phê Minh Phát hết chín trăm ngàn tiền mặt.”
                        </strong>
                      </span>
                    </div>
                  </motion.div>
                )}

                {current.id === 'parsed' && (
                  <motion.div
                    key="stage-parsed"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22 }}
                    className="divide-y divide-border bg-white text-xs"
                  >
                    {[
                      { k: 'Loại thu chi', v: 'Chi nhập hàng bán lại (S2d-HKD)', mono: false },
                      { k: 'Người bán / Nhà cung cấp', v: 'Đại lý Cà phê Minh Phát', mono: false },
                      { k: 'Số lượng × Đơn giá', v: '5 kg × 180.000 đ', mono: true },
                      { k: 'Hình thức trả', v: 'Tiền mặt tại quầy', mono: false },
                    ].map((row, rIdx) => (
                      <motion.div
                        key={row.k}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.22, delay: rIdx * 0.06 }}
                        className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                      >
                        <span className="text-[#475569]">{row.k}</span>
                        <span
                          className={`font-bold ${
                            row.mono ? 'font-mono text-[#2E2396] tabular-nums' : 'text-[#111625]'
                          }`}
                        >
                          {row.v}
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {current.id === 'audited' && (
                  <motion.div
                    key="stage-audited"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22 }}
                    className="divide-y divide-border bg-white text-xs"
                  >
                    {[
                      {
                        t: '1. Cộng trừ nhân chia lại từ đầu',
                        d: '5 × 180.000 = 900.000 đ, khớp số cuối phiếu',
                        b: 'Khớp 100%',
                      },
                      {
                        t: '2. So với giá nhập những lần trước',
                        d: 'Giá lần trước cũng 180.000 đ/kg (không nhảy số)',
                        b: 'Bình thường',
                      },
                      {
                        t: '3. Rà trùng bill chuyển khoản ±3 ngày',
                        d: 'Không tìm thấy ảnh VietQR nào cùng 900.000 đ',
                        b: 'Không trùng',
                      },
                    ].map((chk, cIdx) => (
                      <motion.div
                        key={chk.t}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.22, delay: cIdx * 0.08 }}
                        className="flex flex-col items-start gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#111625]">{chk.t}</div>
                          <div className="mt-0.5 text-[#475569]">{chk.d}</div>
                        </div>
                        <Badge variant="emerald" className="self-start shrink-0 sm:self-center">
                          {chk.b}
                        </Badge>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {current.id === 'ledger' && (
                  <motion.div
                    key="stage-ledger"
                    initial={{ opacity: 0, y: 12, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.99 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="notebook-ledger border-t border-b border-border p-4 pl-6 sm:p-5 sm:pl-16"
                  >
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-semibold text-[#475569]">
                          S2d-HKD • 12/11/2026 • Tiền mặt
                        </div>
                        <div className="mt-1 text-base font-bold text-[#111625]">
                          Đại lý Cà phê Minh Phát
                        </div>
                        <div className="mt-0.5 text-xs text-[#475569]">
                          Cà phê hạt rang xay (5 kg × 180.000 đ) • Đã đính kèm ảnh phiếu #104
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-border/60 pt-2.5 sm:block sm:shrink-0 sm:border-0 sm:pt-0 sm:text-right">
                        <div className="font-mono text-base font-extrabold text-[#111625] tabular-nums">
                          -900.000 đ
                        </div>
                        <div className="sm:mt-1.5">
                          <Stamp animate={true} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
