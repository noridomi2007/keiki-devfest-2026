import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { AppIcon } from '@/components/AppIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { HouseholdLoginPayload } from '../api/endpoints';
import { AuditWorkbench } from '../components/AuditWorkbench';
import { AuthPanel } from '../components/AuthPanel';
import { FloatingNavPill } from '../components/FloatingNavPill';
import { HeroShaderCanvas } from '../components/HeroShaderCanvas';
import { KeikiMark } from '../components/KeikiMark';
import { OdometerNumber } from '../components/OdometerNumber';
import {
  MaskedLine,
  ScrollChapterRail,
  ScrollProgressBar,
  ScrollReveal,
  type ChapterItem,
} from '../components/ScrollChoreography';
import { Stamp } from '../components/Stamp';
import { StepwiseTransform } from '../components/StepwiseTransform';
import { useAnimatedNumber, useReveal } from '../hooks/useRevealAndCounter';
import { vi } from '../i18n/vi';

interface LandingPageProps {
  largeText: boolean;
  onToggleLargeText: () => void;
  onOpenMobileModal: () => void;
  onNavigateLogin: (mode?: 'login' | 'register') => void;
  onLoginSuccess: (payload: HouseholdLoginPayload, welcomeMsg: string) => void;
}

type SheetKey = 'S2a-HKD' | 'S2d-HKD' | 'S2c-HKD' | 'VAY-VON';

interface SheetSpec {
  code: SheetKey;
  title: string;
  subtitle: string;
  columns: string[];
  rows: string[][];
  summary: string;
}

const SHEET_SPECS: SheetSpec[] = [
  {
    code: 'S2a-HKD',
    title: 'Sổ chi tiết Doanh thu bán hàng hóa, dịch vụ',
    subtitle: 'Chia sẵn tiền bán hàng theo đúng 4 nhóm thuế suất GTGT + TNCN tại Thông tư 152/2025/TT-BTC.',
    columns: ['Ngày chứng từ', 'Diễn giải giao dịch', 'Nhóm ngành TT152', 'Thuế suất', 'Thành tiền VND'],
    rows: [
      ['12/11/2026', 'Bán lẻ tại quầy (20 tô mì Quảng + 12 trà đá)', 'Nhóm 2: Dịch vụ ăn uống', '4.5%', '+820.000 đ'],
      ['11/11/2026', 'Hợp đồng thiết kế in ấn (Chuyển khoản)', 'Nhóm 2: Dịch vụ không bao thầu NVL', '7.0%', '+4.200.000 đ'],
      ['10/11/2026', 'Xuất bán sỉ cà phê hạt đóng gói', 'Nhóm 1: Phân phối cung cấp hàng hóa', '1.5%', '+3.650.000 đ'],
    ],
    summary: 'Cộng doanh thu kỳ này: 8.670.000 đ • Thuế tạm tính khớp từng nhóm hàng',
  },
  {
    code: 'S2d-HKD',
    title: 'Sổ chi tiết Vật liệu, dụng cụ, sản phẩm, hàng hóa',
    subtitle: 'Theo dõi nhập-xuất-tồn từng món hàng và nhắc ngay khi giá bỗng cao hơn 30% so với những lần trước.',
    columns: ['Ngày nhập', 'Nhà cung cấp & Mặt hàng', 'Số lượng', 'Đơn giá', 'Kiểm tra giá'],
    rows: [
      ['12/11/2026', 'Cà phê rang xay Minh Phát', '5 kg', '180.000 đ', 'Bằng giá tháng trước (0%)'],
      ['09/11/2026', 'Bao bì giấy kraft 250g', '500 cái', '2.100 đ', 'Khớp giá cũ (-2%)'],
      ['08/11/2026', 'Sữa đặc nguyên kem thùng 48', '2 thùng', '960.000 đ', 'Đã đính kèm ảnh gốc'],
    ],
    summary: 'Đối chiếu hóa đơn giấy với ảnh chuyển khoản VietQR để không ghi trùng tiền nhập hàng',
  },
  {
    code: 'S2c-HKD',
    title: 'Sổ chi tiết Doanh thu & Chi phí sản xuất, kinh doanh',
    subtitle: 'Ghi gọn tiền điện nước, thuê mặt bằng, giao hàng và chi phí vận hành quán mỗi tháng theo Thông tư 152.',
    columns: ['Ngày chi', 'Nội dung chi phí', 'Thanh toán', 'Chứng từ gốc', 'Số tiền VND'],
    rows: [
      ['10/11/2026', 'Tiền điện, nước & Internet cửa hàng T11', 'Chuyển khoản', 'Ảnh hóa đơn EVN', '-1.250.000 đ'],
      ['05/11/2026', 'Thuê mặt bằng kinh doanh tháng 11/2026', 'Chuyển khoản', 'Biên lai VietQR', '-8.500.000 đ'],
      ['03/11/2026', 'Phí giao hàng nội thành đơn sỉ', 'Tiền mặt', 'Ghi âm + Phiếu thu', '-185.000 đ'],
    ],
    summary: 'Tất cả nội dung xuất Excel đều được làm sạch để bảng tính không bị lỗi định dạng',
  },
  {
    code: 'VAY-VON',
    title: 'Bảng tổng hợp chứng từ minh bạch vay vốn ngân hàng',
    subtitle: 'Tổng hợp tỷ lệ khoản thu chi có ảnh hóa đơn hoặc sao kê đi kèm để ngân hàng dễ thẩm định hạn mức.',
    columns: ['Chỉ tiêu đánh giá', 'Giá trị ghi nhận', 'Tỷ lệ xác thực', 'Ý nghĩa với ngân hàng'],
    rows: [
      ['Khoản thu chi có ảnh / ghi âm gốc', '42 / 44 khoản', '95%', 'Chứng minh quán bán thật, thu thật'],
      ['Khoản đã ghép hóa đơn + VietQR', '18 khoản', '100% khớp mã FT', 'Không khai trùng chi phí'],
      ['Tiền lời thực sau chi phí & thuế', 'Vận hành ổn định', 'Khớp sao kê', 'Căn cứ xét hạn mức vay ưu đãi'],
    ],
    summary: 'Tải về trọn bộ file .xlsx chuẩn TT 152/2025 kèm gói .zip lưu ảnh gốc từng hóa đơn',
  },
];

const HERO_PARSE_FEED = [
  { raw: '"Sáng ni bán 20 tô mì Quảng tiền mặt"', sheet: 'S2a-HKD', result: '+700.000 đ' },
  { raw: '"Nhập 5kg cà phê hạt Minh Phát 180k/kg"', sheet: 'S2d-HKD', result: '-900.000 đ' },
  { raw: '"Chuyển khoản tiền điện EVN tháng 11"', sheet: 'S2c-HKD', result: '-1.250.000 đ' },
];

const FLOATING_NAV_ITEMS = [
  { id: 'hanh-trinh', roman: 'I', label: 'Hành trình' },
  { id: 'thu-nghiem', roman: 'II', label: 'Thử bắt lỗi' },
  { id: 'quy-trinh', roman: 'III', label: 'Cách hoạt động' },
  { id: 'so-tt152', roman: 'IV', label: 'Bộ 4 sổ' },
];

const CHAPTER_RAIL_ITEMS: ChapterItem[] = [
  { id: 'hero-top', roman: '0', label: 'Mở đầu' },
  { id: 'hanh-trinh', roman: 'I', label: 'Hành trình 4 bước' },
  { id: 'thu-nghiem', roman: 'II', label: 'Thử bắt lỗi' },
  { id: 'quy-trinh', roman: 'III', label: 'Cách hoạt động' },
  { id: 'so-tt152', roman: 'IV', label: 'Bộ 4 sổ thuế' },
  { id: 'dang-nhap', roman: 'V', label: 'Dùng thử ngay' },
];

function MetricItem({
  value,
  suffix = '',
  label,
  detail,
  icon,
  accent,
  delay = 0,
  active,
}: {
  value: number;
  suffix?: string;
  label: string;
  detail: string;
  icon: string;
  accent: 'indigo' | 'emerald' | 'amber' | 'slate';
  delay?: number;
  active: boolean;
}) {
  const animated = useAnimatedNumber(value, active, 850);
  const formatted = `${value < 10 && value > 0 ? `0${animated}` : animated}${suffix}`;
  const accentStyles = {
    indigo: 'from-[#2E2396] to-[#4F46E5] bg-[#2E2396]/10 text-[#2E2396]',
    emerald: 'from-[#0B6E54] to-emerald-500 bg-emerald-50 text-[#0B6E54]',
    amber: 'from-amber-500 to-orange-500 bg-amber-50 text-[#92400E]',
    slate: 'from-slate-700 to-slate-900 bg-slate-100 text-[#111625]',
  }[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group relative overflow-hidden p-5 transition-colors hover:bg-[#F6F8FB]/70 sm:p-6"
    >
      <div className={`absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r opacity-75 transition-opacity group-hover:opacity-100 ${accentStyles.split(' ').slice(0, 2).join(' ')}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="font-heading text-3xl font-extrabold tracking-tight text-[#111625] tabular-nums sm:text-4xl">
          <OdometerNumber value={formatted} />
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${accentStyles.split(' ').slice(2).join(' ')}`}>
          <AppIcon name={icon} className="text-lg" />
        </span>
      </div>
      <div className="mt-2 text-sm font-bold text-[#2E2396]">{label}</div>
      <p className="mt-1 text-xs leading-relaxed text-[#475569]">{detail}</p>
    </motion.div>
  );
}

export function LandingPage({
  largeText,
  onToggleLargeText,
  onOpenMobileModal,
  onNavigateLogin,
  onLoginSuccess,
}: LandingPageProps) {
  const [heroScenario, setHeroScenario] = useState<'clean' | 'duplicate'>('duplicate');
  const [activeSheet, setActiveSheet] = useState<SheetKey>('S2a-HKD');
  const [feedIdx, setFeedIdx] = useState<number>(0);

  const [metricsRef, metricsVisible] = useReveal<HTMLDivElement>(0.15);
  const heroRef = useRef<HTMLElement>(null);

  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroLeftY = useTransform(heroScroll, [0, 1], [0, -10]);
  const heroCardY = useTransform(heroScroll, [0, 1], [0, -24]);

  const cardTiltX = useMotionValue(0);
  const cardTiltY = useMotionValue(0);
  const smoothTiltX = useSpring(cardTiltX, { stiffness: 220, damping: 24 });
  const smoothTiltY = useSpring(cardTiltY, { stiffness: 220, damping: 24 });

  const handleHeroCardMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    cardTiltX.set(-py * 8);
    cardTiltY.set(px * 8);
  };

  const resetHeroCardTilt = () => {
    cardTiltX.set(0);
    cardTiltY.set(0);
  };

  const selectedSheet = SHEET_SPECS.find((s) => s.code === activeSheet) || SHEET_SPECS[0];
  const currentFeed = HERO_PARSE_FEED[feedIdx];

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setFeedIdx((prev) => (prev + 1) % HERO_PARSE_FEED.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-clip bg-[#F6F8FB] text-[#111625]">
        <ScrollProgressBar />
        <ScrollChapterRail chapters={CHAPTER_RAIL_ITEMS} onNavigate={scrollToSection} />

        {/* Sticky Top Navbar */}
        <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
              <KeikiMark className="h-9 w-9 shrink-0" />
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-lg font-extrabold tracking-tight text-[#111625]">
                  Keiki
                </span>
                <span className="hidden font-mono text-xs font-semibold text-[#2E2396] sm:inline">
                  TT 152/2025
                </span>
              </div>
            </div>

            <nav className="hidden shrink-0 items-center gap-6 whitespace-nowrap text-xs font-semibold text-[#475569] lg:flex">
              <a href="#hanh-trinh" className="transition hover:text-[#2E2396]">
                Xem cách biến đổi
              </a>
              <a href="#thu-nghiem" className="transition hover:text-[#2E2396]">
                Thử bắt lỗi
              </a>
              <a href="#quy-trinh" className="transition hover:text-[#2E2396]">
                Cách hoạt động
              </a>
              <a href="#so-tt152" className="transition hover:text-[#2E2396]">
                Bộ sổ TT 152
              </a>
            </nav>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenMobileModal}
                title="Mở trên Điện thoại (Mã QR)"
                className="h-8 w-8 px-0 text-xs sm:h-9 sm:w-auto sm:px-2.5"
              >
                <AppIcon name="qr_code_2" className="text-base" />
                <span className="hidden md:inline">QR</span>
              </Button>

              <Button
                type="button"
                variant={largeText ? 'default' : 'outline'}
                size="sm"
                onClick={onToggleLargeText}
                title="Bật chế độ Chữ to dễ đọc"
                className="h-8 w-8 px-0 text-xs sm:h-9 sm:w-auto sm:px-2.5"
              >
                <AppIcon name="format_size" className="text-base" />
                <span className="hidden xl:inline">Chữ to</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onNavigateLogin('login')}
                className="hidden h-9 px-3 text-xs sm:inline-flex"
              >
                Đăng nhập
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => onNavigateLogin('register')}
                className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
              >
                <span>Mở sổ</span>
                <AppIcon name="arrow_forward" className="text-sm" />
              </Button>
            </div>
          </div>
        </header>

        {/* Editorial Asymmetric Hero with Luminous Contour Shader & Ambient Aurora */}
        <section
          id="hero-top"
          ref={heroRef}
          className="relative overflow-hidden border-b border-border/60 bg-[#F6F8FB]"
        >
          <HeroShaderCanvas />
          <div className="relative z-10 mx-auto max-w-6xl px-4 pt-10 pb-12 sm:px-6 lg:pt-16 lg:pb-16">
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
              {/* Hero Left: Masked Kinetic Typography Entrance */}
              <motion.div style={{ y: heroLeftY }} className="min-w-0 lg:col-span-6">
                <p className="mb-3 font-mono text-xs font-semibold tracking-wider text-[#0B6E54] uppercase">
                  Gemini Vision + Kiểm toán Python • Chuẩn TT 152/2025
                </p>

                <h1 className="font-heading text-4xl font-extrabold leading-[1.08] tracking-tight text-[#111625] sm:text-5xl lg:text-[3.25rem]">
                  <MaskedLine delay={0.05}>Chụp hóa đơn.</MaskedLine>
                  <MaskedLine delay={0.16}>Nói một câu.</MaskedLine>
                  <MaskedLine delay={0.27}>
                    <span className="text-[#2E2396]">Sổ sách tự vào đúng dòng.</span>
                  </MaskedLine>
                </h1>

                <motion.p
                  initial={{ opacity: 0.96, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-5 max-w-[58ch] text-base leading-relaxed text-[#475569]"
                >
                  Bán hàng cả ngày mệt nhoài, tối về khỏi phải lật từng tờ bill cộng tay hay đau đầu
                  chia cột sổ sách. Cứ chụp lại hóa đơn, ảnh chuyển khoản hoặc đọc miệng vài chữ —
                  Keiki tự nhặt số, kiểm lại cho đỡ nhầm lẫn rồi xếp gọn vào đủ 4 cuốn sổ thuế.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0.96, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.48, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-7 flex flex-wrap items-center gap-3"
                >
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => scrollToSection('thu-nghiem')}
                    className="btn-shimmer group h-12 rounded-xl px-6 text-sm font-bold shadow-lg shadow-[#2E2396]/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#2E2396]/35 active:translate-y-px"
                  >
                    <span>Thử bắt lỗi ngay</span>
                    <AppIcon name="play_arrow" className="text-lg transition-transform group-hover:translate-x-0.5" />
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => onNavigateLogin('login')}
                    className="glass-surface h-12 rounded-xl border-[#2E2396]/20 px-6 text-sm font-bold transition-all hover:-translate-y-0.5 hover:border-[#2E2396]/45 hover:bg-white active:translate-y-px"
                  >
                    <AppIcon name="menu_book" className="text-lg text-[#2E2396]" />
                    <span>Vào sổ của quán</span>
                  </Button>
                </motion.div>

                {/* Live Voice/OCR Parsing Ticker Strip */}
                <motion.div
                  initial={{ opacity: 0.96, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.48, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="glass-surface mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2E2396]/15 px-3.5 py-2.5 text-xs shadow-sm"
                >
                  <span className="inline-flex min-w-0 items-center gap-2 font-medium text-[#475569]">
                    <span className="audit-live-dot inline-block h-2 w-2 shrink-0 rounded-full bg-[#0B6E54]" />
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={currentFeed.raw}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.24 }}
                        className="truncate font-medium text-[#111625]"
                      >
                        {currentFeed.raw}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={`${currentFeed.sheet}-${currentFeed.result}`}
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ duration: 0.22 }}
                      className="shrink-0 rounded-md bg-[#2E2396]/8 px-2 py-0.5 font-mono text-xs font-bold text-[#2E2396] tabular-nums"
                    >
                      → {currentFeed.sheet} • {currentFeed.result}
                    </motion.span>
                  </AnimatePresence>
                </motion.div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-[#2E2396]/25 bg-white/85 text-[#2E2396] shadow-2xs">
                    Chuẩn Thông tư 152/2025
                  </Badge>
                  <Badge variant="secondary" className="bg-white/80">
                    Không cần biết nghiệp vụ kế toán
                  </Badge>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 border-t border-border pt-5 text-xs sm:grid-cols-3 sm:gap-4">
                  <div className="rounded-xl p-2 transition-colors hover:bg-white/60">
                    <div className="font-bold text-[#111625]">Chặn ghi trùng</div>
                    <div className="mt-0.5 text-[#475569]">Thấy bill trùng QR là hỏi ngay</div>
                  </div>
                  <div className="rounded-xl p-2 transition-colors hover:bg-white/60">
                    <div className="font-bold text-[#111625]">Đủ bộ 4 sổ Excel</div>
                    <div className="mt-0.5 text-[#475569]">Kèm luôn gói ảnh hóa đơn gốc</div>
                  </div>
                  <div className="rounded-xl p-2 transition-colors hover:bg-white/60">
                    <div className="font-bold text-[#111625]">Sổ ai nấy giữ</div>
                    <div className="mt-0.5 text-[#475569]">Riêng tư theo từng tài khoản</div>
                  </div>
                </div>
              </motion.div>

              {/* Hero Right: 3D Interactive Ledger Specimen Card with OCR Scan Beam & Floating Badges */}
              <motion.div
                initial={{ opacity: 0.96, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.62, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  y: heroCardY,
                  rotateX: smoothTiltX,
                  rotateY: smoothTiltY,
                  transformPerspective: 1100,
                }}
                onPointerMove={handleHeroCardMove}
                onPointerLeave={resetHeroCardTilt}
                className="relative min-w-0 will-change-transform lg:col-span-6"
              >
                {/* Luminous Halo behind specimen card */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none -inset-3 absolute rounded-3xl bg-gradient-to-tr from-[#2E2396]/18 via-indigo-400/10 to-[#0B6E54]/18 blur-2xl"
                />

                {/* Floating 3D Badge Top-Right (desktop) */}
                <div className="float-bob pointer-events-none -top-4 -right-3 absolute z-20 hidden items-center gap-1.5 rounded-full border border-[#0B6E54]/30 bg-white/95 px-3 py-1.5 text-xs font-bold text-[#0B6E54] shadow-lg backdrop-blur xl:flex">
                  <AppIcon name="verified" className="text-sm" />
                  <span>Python khớp 100%</span>
                </div>

                {/* Floating 3D Badge Bottom-Left (desktop) */}
                <div className="float-bob-slow pointer-events-none -bottom-4 -left-3 absolute z-20 hidden items-center gap-1.5 rounded-full border border-[#2E2396]/25 bg-[#111625]/95 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur xl:flex">
                  <span className="audit-live-dot h-2 w-2 rounded-full bg-emerald-400" />
                  <span>Quét OCR + VietQR tự động</span>
                </div>

                <Card className="card-interactive relative gap-0 overflow-hidden border-[#2E2396]/20 bg-white/95 py-0 shadow-xl shadow-[#2E2396]/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-[#F6F8FB] via-white to-[#F6F8FB] px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#111625]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#2E2396]/10 text-[#2E2396]">
                        <AppIcon name="fact_check" className="text-sm" />
                      </span>
                      <span>Kiểm chứng sổ thực tế</span>
                    </div>
                    <Tabs
                      value={heroScenario}
                      onValueChange={(val) => setHeroScenario(val as 'clean' | 'duplicate')}
                    >
                      <TabsList className="h-8 bg-slate-200/75 p-0.5">
                        <TabsTrigger
                          value="clean"
                          className="h-7 cursor-pointer px-2.5 text-xs font-bold transition-all data-active:bg-[#0B6E54] data-active:text-white data-active:shadow-xs"
                        >
                          Hợp lệ
                        </TabsTrigger>
                        <TabsTrigger
                          value="duplicate"
                          className="h-7 cursor-pointer px-2.5 text-xs font-bold transition-all data-active:bg-[#B91C1C] data-active:text-white data-active:shadow-xs"
                        >
                          Trùng chéo VietQR
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Ruled Paper Specimen Body with Live OCR Scan Beam */}
                  <div className="notebook-ledger relative overflow-hidden p-4 pl-6 sm:p-6 sm:pl-20">
                    <div aria-hidden="true" className="scan-beam" />
                    <div className="relative z-10 space-y-4">
                      {/* Source 1 */}
                      <div className="flex flex-col gap-2 border-b border-border pb-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-semibold text-[#475569]">
                            Chứng từ #01 • Ảnh hóa đơn giấy
                          </div>
                          <div className="mt-1 text-sm font-bold text-[#111625]">
                            Cà phê rang xay Minh Phát
                          </div>
                          <div className="text-xs text-[#475569]">
                            5 kg × 180.000 đ • Tiền mặt • 12/11/2026
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1 sm:block sm:shrink-0 sm:pt-0 sm:text-right">
                          <div className="font-mono text-sm font-extrabold text-[#111625] tabular-nums">
                            -900.000 đ
                          </div>
                          <div className="sm:mt-1.5">
                            <Stamp animate={false} />
                          </div>
                        </div>
                      </div>

                      {/* Dynamic Comparison State (AnimatePresence swap) */}
                      <AnimatePresence mode="wait">
                        {heroScenario === 'clean' ? (
                          <motion.div
                            key="clean"
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                            className="rounded-xl bg-emerald-50/90 p-3.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B6E54]">
                                <AppIcon name="calculate" className="text-base" />
                                Đã kiểm tra xong: Hợp lệ
                              </span>
                              <Badge variant="emerald" className="font-mono">
                                S2d-HKD
                              </Badge>
                            </div>
                            <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
                              Số tiền <code className="font-mono text-[#111625]">5 × 180.000 = 900.000 đ</code> khớp
                              đúng trên tờ hóa đơn. Giá nhập vẫn bằng tháng trước.
                            </p>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="duplicate"
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                            className="space-y-3"
                          >
                            <div className="flex flex-col gap-1.5 border-b border-[#B91C1C]/20 pb-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                              <div className="min-w-0">
                                <div className="font-mono text-xs font-bold text-[#B91C1C]">
                                  Chứng từ #02 • Ảnh chụp VietQR (14:22)
                                </div>
                                <div className="mt-0.5 text-xs font-bold text-[#111625]">
                                  CK: PHAM VAN MINH — "TT ca phe Minh Phat"
                                </div>
                              </div>
                              <div className="shrink-0 font-mono text-xs font-extrabold text-[#B91C1C] tabular-nums sm:text-right">
                                -900.000 đ
                              </div>
                            </div>

                            <div className="rounded-xl bg-red-50/95 p-3.5">
                              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B91C1C]">
                                  <AppIcon name="compare_arrows" className="text-base" />
                                  Nghi trùng bill chuyển khoản (CROSS_DUPLICATE)
                                </span>
                                <Badge variant="destructive" className="self-start font-bold sm:self-center">
                                  CẦN HỎI LẠI
                                </Badge>
                              </div>
                              <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
                                Keiki dừng lại hỏi bạn trước khi gộp hai giấy tờ làm một — để không
                                bị ghi nhầm thành hai khoản chi giống nhau.
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </div>

            {/* Lusion-Inspired Technical Crosshair Registration Rule */}
            <div className="mt-10 flex items-center justify-between gap-2 border-t border-border/70 pt-4 font-mono text-xs text-[#475569]">
              <span aria-hidden="true" className="font-bold text-[#111625]">+</span>
              <span className="hidden sm:inline">CHỤP HÓA ĐƠN • ĐỌC THOẠI • DÒ NHẦM LẪN • LÊN SỔ S1a–S2e</span>
              <span className="sm:hidden">CHỤP BILL • DÒ NHẦM LẪN</span>
              <button
                type="button"
                onClick={() => scrollToSection('hanh-trinh')}
                className="shrink-0 cursor-pointer font-semibold text-[#2E2396] transition hover:underline"
              >
                <span className="hidden sm:inline">CUỘN XUỐNG XEM CHI TIẾT ↓</span>
                <span className="sm:hidden">XEM CHI TIẾT ↓</span>
              </button>
              <span aria-hidden="true" className="hidden font-bold text-[#111625] md:inline">+</span>
            </div>
          </div>
        </section>

        {/* Precision Metrics Strip */}
        <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
          <ScrollReveal y={22}>
            <div
              ref={metricsRef}
              className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white shadow-md shadow-slate-900/5 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x"
            >
              <MetricItem
                value={4}
                label="Cuốn sổ thuế chuẩn mẫu"
                detail="Tự chia sẵn S1, S2, S3 và bảng chứng minh thu nhập gửi ngân hàng."
                icon="menu_book"
                accent="indigo"
                delay={0.04}
                active={metricsVisible}
              />
              <MetricItem
                value={6}
                label="Lượt dò số trước khi lưu"
                detail="AI lo đọc chữ khó, còn cộng trừ nhân chia do máy tính tự kiểm lại."
                icon="shield"
                accent="emerald"
                delay={0.1}
                active={metricsVisible}
              />
              <MetricItem
                value={100}
                suffix="%"
                label="Lưu kèm ảnh hóa đơn gốc"
                detail="Mỗi dòng thu chi đều gắn lại ảnh chụp, biên lai hoặc file ghi âm ban đầu."
                icon="photo_library"
                accent="amber"
                delay={0.16}
                active={metricsVisible}
              />
              <MetricItem
                value={0}
                label="Lần tự ghi bừa khi thấy lạ"
                detail="Thấy giá đắt bất thường hay trùng bill là dừng lại hỏi chủ quán trước."
                icon="rule"
                accent="slate"
                delay={0.22}
                active={metricsVisible}
              />
            </div>
          </ScrollReveal>
        </section>

        {/* Section I: Stepwise Before -> After Transformation Showcase (Sticky Scroll-Scrubbed) */}
        <section id="hanh-trinh" className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
          <ScrollReveal y={24} className="mb-6 max-w-2xl">
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-[#111625] sm:text-3xl">
              <span className="mr-2 font-mono text-[#2E2396]">I.</span>
              Từ tờ bill nhàu đến dòng sổ thuế gọn gàng
            </h2>
            <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-[#475569]">
              Lướt chậm qua khu vực bên dưới (hoặc bấm từng bước) để xem một hóa đơn viết tay hay
              câu nói vội tại quầy đi qua khâu kiểm tra nào trước khi lên sổ.
            </p>
          </ScrollReveal>

          <StepwiseTransform />
        </section>

        {/* Section II: Interactive AI & Python Sandbox Workbench */}
        <section id="thu-nghiem" className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
          <ScrollReveal y={24} className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="font-heading text-2xl font-extrabold tracking-tight text-[#111625] sm:text-3xl">
                <span className="mr-2 font-mono text-[#2E2396]">II.</span>
                Tự tay thử bắt lỗi hóa đơn ngay tại đây
              </h2>
              <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-[#475569]">
                Bấm thử một lệnh mẫu bên dưới hoặc kéo chỉnh đơn giá xem Keiki tự nhân lại tiền,
                phát hiện giá nhảy vọt hay chặn bill chuyển khoản trùng như thế nào.
              </p>
            </div>
            <Button
              type="button"
              variant="link"
              onClick={() => onNavigateLogin('login')}
              className="h-auto px-0 text-xs font-bold text-[#2E2396]"
            >
              <span>Thử bằng ảnh hóa đơn thật của bạn</span>
              <AppIcon name="arrow_forward" className="text-base" />
            </Button>
          </ScrollReveal>

          <ScrollReveal delay={0.08} y={24}>
            <AuditWorkbench />
          </ScrollReveal>
        </section>

        {/* Section III: Dual-Engine Architecture + Live Signal Flow Diagram */}
        <section id="quy-trinh" className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
          <ScrollReveal y={24} className="mb-6 max-w-2xl">
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-[#111625] sm:text-3xl">
              <span className="mr-2 font-mono text-[#2E2396]">III.</span>
              AI chỉ đọc chữ — Máy tính kiểm tiền, không lo tính ẩu
            </h2>
            <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-[#475569]">
              Nhiều chủ quán ngại dùng AI làm sổ vì sợ nó tự đoán mò rồi cộng sai tiền. Keiki chia làm
              2 khâu riêng: Gemini đọc ảnh và giọng nói; mọi phép tính, so giá và tìm bill trùng đều
              chạy bằng công thức cố định.
            </p>
          </ScrollReveal>

          <Card className="card-interactive min-w-0 gap-0 overflow-hidden border-[#2E2396]/15 py-0 shadow-md shadow-slate-900/5">
            {/* Top Animated Signal Pipeline Strip with Traveling Light Packets */}
            <div className="border-b border-border bg-gradient-to-r from-[#F6F8FB] via-white to-[#F6F8FB] px-4 py-5 sm:px-8">
              <div className="flex flex-col gap-3.5 md:flex-row md:items-center md:justify-between md:gap-4">
                <ScrollReveal y={14} delay={0.05} className="flex items-center gap-3">
                  <motion.div
                    whileHover={{ scale: 1.08, rotate: -4 }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#2E2396] shadow-xs ring-1 ring-border"
                  >
                    <AppIcon name="photo_camera" className="text-base" />
                  </motion.div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#111625]">1. Ảnh / Ghi âm gốc</div>
                    <div className="text-xs text-[#475569]">Hóa đơn, VietQR, Thoại</div>
                  </div>
                </ScrollReveal>

                <div className="relative hidden min-w-[56px] flex-1 items-center justify-center md:flex">
                  <svg className="h-3 w-full" viewBox="0 0 80 12" fill="none" aria-hidden="true">
                    <line
                      x1="2"
                      y1="6"
                      x2="78"
                      y2="6"
                      stroke="#2E2396"
                      strokeWidth="2"
                      className="signal-flow-line"
                    />
                  </svg>
                  <motion.span
                    aria-hidden="true"
                    animate={{ left: ['4%', '92%'], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#4F46E5] shadow-[0_0_10px_#4F46E5]"
                  />
                </div>

                <ScrollReveal y={14} delay={0.14} className="flex items-center gap-3">
                  <motion.div
                    animate={{ boxShadow: ['0 0 0 0 rgba(46,35,150,0.35)', '0 0 0 8px rgba(46,35,150,0)', '0 0 0 0 rgba(46,35,150,0)'] }}
                    transition={{ duration: 2.4, repeat: Infinity }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2E2396] text-white shadow-sm"
                  >
                    <AppIcon name="psychology" className="text-base" />
                  </motion.div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#111625]">2. Gemini đọc &amp; hiểu ý</div>
                    <div className="text-xs text-[#475569]">Nhặt tên hàng, ngày, số</div>
                  </div>
                </ScrollReveal>

                <div className="relative hidden min-w-[56px] flex-1 items-center justify-center md:flex">
                  <svg className="h-3 w-full" viewBox="0 0 80 12" fill="none" aria-hidden="true">
                    <line
                      x1="2"
                      y1="6"
                      x2="78"
                      y2="6"
                      stroke="#0B6E54"
                      strokeWidth="2"
                      className="signal-flow-line"
                    />
                  </svg>
                  <motion.span
                    aria-hidden="true"
                    animate={{ left: ['4%', '92%'], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.8, delay: 0.7, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#0B6E54] shadow-[0_0_10px_#0B6E54]"
                  />
                </div>

                <ScrollReveal y={14} delay={0.23} className="flex items-center gap-3">
                  <motion.div
                    animate={{ boxShadow: ['0 0 0 0 rgba(11,110,84,0.35)', '0 0 0 8px rgba(11,110,84,0)', '0 0 0 0 rgba(11,110,84,0)'] }}
                    transition={{ duration: 2.4, delay: 0.9, repeat: Infinity }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B6E54] text-white shadow-sm"
                  >
                    <AppIcon name="shield" className="text-base" />
                  </motion.div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#111625]">3. Máy tính kiểm số</div>
                    <div className="text-xs text-[#475569]">Đủ sổ S1a–S2e</div>
                  </div>
                </ScrollReveal>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Column 1: AI Comprehension (5 columns) */}
              <div className="min-w-0 border-b border-border p-5 sm:p-8 lg:col-span-5 lg:border-r lg:border-b-0">
                <h3 className="font-heading text-lg font-bold text-[#111625]">
                  Nghe hiểu giọng nói 3 miền và hóa đơn chụp vội
                </h3>
                <div className="mt-2.5">
                  <Badge variant="outline" className="border-[#2E2396]/30 text-[#2E2396]">
                    <AppIcon name="psychology" className="text-sm" />
                    Khâu đọc hiểu — Google Gemini
                  </Badge>
                </div>

                <ul className="mt-6 divide-y divide-border text-xs leading-relaxed text-[#475569]">
                  <motion.li
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-start gap-3 py-3.5 first:pt-0"
                  >
                    <AppIcon name="document_scanner" className="mt-0.5 shrink-0 text-base text-[#2E2396]" />
                    <span>
                      Đọc được cả phiếu viết tay nghệch ngoạc, giấy in nhiệt mờ và ảnh chụp chuyển
                      khoản ngân hàng VietQR.
                    </span>
                  </motion.li>
                  <motion.li
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.45, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-start gap-3 py-3.5"
                  >
                    <AppIcon name="graphic_eq" className="mt-0.5 shrink-0 text-base text-[#2E2396]" />
                    <span>
                      Hiểu cách nói bình dân thường ngày ("tá lốc", "trăm rưỡi", "mới bán thiếu") để
                      xếp đúng cột doanh thu hay chi phí.
                    </span>
                  </motion.li>
                  <motion.li
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.45, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-start gap-3 py-3.5 last:pb-0"
                  >
                    <AppIcon name="verified" className="mt-0.5 shrink-0 text-base text-[#2E2396]" />
                    <span>
                      Gặp chỗ nào mực nhòe hoặc nghe chưa chắc là bôi vàng hỏi lại ngay, tuyệt đối
                      không tự đoán mò.
                    </span>
                  </motion.li>
                </ul>
              </div>

              {/* Column 2: Deterministic Python Audit (7 columns) */}
              <div className="min-w-0 bg-[#F6F8FB]/60 p-5 sm:p-8 lg:col-span-7">
                <h3 className="font-heading text-lg font-bold text-[#111625]">
                  Bắt gọn 3 lỗi sai sổ hay gặp nhất ngoài quầy
                </h3>
                <div className="mt-2.5">
                  <Badge variant="emerald">
                    <AppIcon name="shield" className="text-sm" />
                    Khâu kiểm tra công thức — Python
                  </Badge>
                </div>

                <div className="mt-6 divide-y divide-border">
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.48, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col items-start gap-2.5 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#111625]">
                        Tránh ghi 2 lần hóa đơn giấy + VietQR (<code className="font-mono text-xs">CROSS_DUPLICATE</code>)
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[#475569]">
                        Nếu vừa chụp tờ bill sáng nay, chiều lại dán thêm ảnh chuyển khoản cùng số
                        tiền trong vòng 3 ngày, Keiki hỏi bạn gộp làm một.
                      </p>
                    </div>
                    <Badge variant="destructive" className="self-start shrink-0 font-mono sm:self-center">
                      Khỏi tính thuế 2 lần
                    </Badge>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.48, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col items-start gap-2.5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#111625]">
                        Nhắc ngay khi lỡ bấm dư số 0 (<code className="font-mono text-xs">PRICE_ANOMALY</code>)
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[#475569]">
                        So giá từng mặt hàng với các lần nhập cũ; nếu bỗng cao hơn 30%, hệ thống tô
                        vàng và đọc tiếng Việt nhắc kiểm tra lại.
                      </p>
                    </div>
                    <Badge variant="amber" className="self-start shrink-0 font-mono sm:self-center">
                      Chặn nhầm giá nhập
                    </Badge>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.48, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col items-start gap-2.5 py-4 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#111625]">
                        Khóa riêng dữ liệu &amp; Xuất Excel sạch
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[#475569]">
                        Mỗi cửa hàng giữ sổ riêng biệt sau khi đăng nhập; tệp Excel xuất ra làm sạch
                        hoàn toàn ký tự dễ gây lỗi công thức.
                      </p>
                    </div>
                    <Badge variant="emerald" className="self-start shrink-0 font-mono sm:self-center">
                      Sẵn sàng dùng thật
                    </Badge>
                  </motion.div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Section IV: Circular 152 Interactive Sheet Preview */}
        <section id="so-tt152" className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
          <ScrollReveal y={24} className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="font-heading text-2xl font-extrabold tracking-tight text-[#111625] sm:text-3xl">
                <span className="mr-2 font-mono text-[#2E2396]">IV.</span>
                Trọn bộ sổ Thông tư 152/2025 &amp; Hồ sơ vay vốn
              </h2>
            </div>

            <Tabs
              value={activeSheet}
              onValueChange={(val) => setActiveSheet(val as SheetKey)}
            >
              <TabsList className="flex h-auto flex-wrap gap-1 bg-slate-200/70 p-1">
                {SHEET_SPECS.map((spec) => {
                  const isActive = activeSheet === spec.code;
                  return (
                    <TabsTrigger
                      key={spec.code}
                      value={spec.code}
                      className={`relative h-8 cursor-pointer font-mono text-xs font-bold transition-colors data-active:bg-transparent data-active:shadow-none ${
                        isActive ? 'text-white' : 'text-[#334155] hover:text-[#111625]'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="tt152-sheet-pill"
                          transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                          className="absolute inset-0 rounded-md bg-[#2E2396]"
                        />
                      )}
                      <span className="relative z-10">{spec.code}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </ScrollReveal>

          <ScrollReveal delay={0.08} y={24}>
            <Card className="card-interactive min-w-0 gap-0 overflow-hidden border-[#2E2396]/15 py-0 shadow-md shadow-slate-900/5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-[#F6F8FB] via-white to-[#F6F8FB] px-5 py-4">
              <div>
                <h3 className="font-heading text-base font-bold text-[#111625]">
                  {selectedSheet.title}
                </h3>
                <p className="mt-0.5 text-xs text-[#475569]">{selectedSheet.subtitle}</p>
              </div>
              <Badge variant="outline" className="border-[#2E2396]/30 bg-white font-mono font-bold text-[#2E2396]">
                {selectedSheet.code}
              </Badge>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={selectedSheet.code}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      {selectedSheet.columns.map((col, idx) => (
                        <TableHead
                          key={col}
                          className={`px-5 py-3 text-xs font-bold tracking-wider text-[#475569] uppercase ${
                            idx === selectedSheet.columns.length - 1 ? 'text-right' : ''
                          }`}
                        >
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSheet.rows.map((row, rIdx) => (
                      <motion.tr
                        key={`${selectedSheet.code}-${rIdx}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.28, delay: rIdx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                        className="border-b border-border/70 transition-colors hover:bg-[#2E2396]/[0.035]"
                      >
                        {row.map((cell, cIdx) => {
                          const isLast = cIdx === row.length - 1;
                          const isPositive = cell.startsWith('+');
                          return (
                            <TableCell
                              key={cIdx}
                              className={`px-5 py-3.5 text-xs ${
                                isLast ? 'text-right font-mono font-extrabold tabular-nums' : ''
                              } ${
                                cIdx === 0 ? 'font-mono text-[#475569]' : 'text-[#111625]'
                              } ${isPositive ? 'text-[#0B6E54]' : ''}`}
                            >
                              {cell}
                            </TableCell>
                          );
                        })}
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-[#F6F8FB]/70 px-5 py-3 text-xs text-[#475569]">
              <span>{selectedSheet.summary}</span>
              <span className="font-mono text-xs font-bold text-[#0B6E54]">
                Định dạng .XLSX &amp; .ZIP chứng từ
              </span>
            </div>
            </Card>
          </ScrollReveal>
        </section>

        {/* Section: Integrated Auth Gate */}
        <section id="dang-nhap" className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <ScrollReveal y={24} className="min-w-0 space-y-4 lg:col-span-5">
              <h2 className="font-heading text-2xl font-extrabold tracking-tight text-[#111625] sm:text-3xl">
                <span className="mr-2 font-mono text-[#2E2396]">V.</span>
                Mở sổ kế toán riêng cho cửa hàng của bạn
              </h2>
              <p className="text-sm leading-relaxed text-[#475569]">
                Đăng nhập nhanh bằng Google hoặc Số điện thoại. Sổ sách, ảnh hóa đơn và thuế của
                quán nào đều được giữ riêng cho quán đó.
              </p>

              <div className="space-y-2.5 pt-2 text-xs text-[#111625]">
                <div className="flex items-center gap-2">
                  <AppIcon name="qr_code_scanner" className="text-lg text-[#0B6E54]" />
                  <span>Cài đặt nhanh trên điện thoại bằng mã QR để chụp hóa đơn tại quầy</span>
                </div>
                <div className="flex items-center gap-2">
                  <AppIcon name="key" className="text-lg text-[#0B6E54]" />
                  <span>Tùy chọn kết nối Google Gemini API cá nhân hoặc dùng chế độ tích hợp</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenMobileModal}
                  className="h-9 text-xs font-bold"
                >
                  <AppIcon name="smartphone" className="text-base text-[#2E2396]" />
                  Mở trên Điện thoại (QR)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateLogin('login')}
                  className="h-9 text-xs font-bold text-[#2E2396]"
                >
                  <span>Mở màn hình Đăng nhập riêng</span>
                  <AppIcon name="open_in_new" className="text-base" />
                </Button>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.1} y={26} className="relative min-w-0 lg:col-span-7">
              <div
                aria-hidden="true"
                className="pointer-events-none -inset-2 absolute rounded-3xl bg-gradient-to-br from-[#2E2396]/14 via-transparent to-[#0B6E54]/14 blur-xl"
              />
              <div className="relative">
                <AuthPanel variant="embedded" onLoginSuccess={onLoginSuccess} />
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Clean Minimal Footer with Desktop Dock Safe Clearance */}
        <footer className="border-t border-border bg-white py-6 lg:pb-24">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-[#475569] sm:px-6">
            <div className="flex items-center gap-2 font-semibold text-[#111625]">
              <KeikiMark className="h-6 w-6" />
              <span>Keiki — Sổ Kế Toán Tự Nhiên</span>
            </div>
            <p className="text-xs">{vi.legalFooter}</p>
          </div>
        </footer>

        {/* Awwwards-Style Desktop Sticky Navigation Dock */}
        <FloatingNavPill
          items={FLOATING_NAV_ITEMS}
          onNavigate={scrollToSection}
          onStartDemo={() => scrollToSection('dang-nhap')}
        />
      </div>
    </MotionConfig>
  );
}
