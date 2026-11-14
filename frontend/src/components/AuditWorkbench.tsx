import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppIcon } from '@/components/AppIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { OdometerNumber } from './OdometerNumber';
import { Stamp } from './Stamp';

export type WorkbenchScenarioId =
  | 'receipt_clean'
  | 'cross_transfer'
  | 'voice_vn'
  | 'live_sandbox';

interface SimStep {
  code: string;
  title: string;
  detail: string;
  icon: string;
  tone?: 'indigo' | 'emerald' | 'crimson' | 'amber';
}

interface WorkbenchScenario {
  id: Exclude<WorkbenchScenarioId, 'live_sandbox'>;
  tabLabel: string;
  tabTag: string;
  inputTypeLabel: string;
  inputIcon: string;
  inputHeader: string;
  inputLines: string[];
  pythonCheckLabel: string;
  pythonCheckFormula: string;
  pythonCheckPassed: boolean;
  steps: SimStep[];
  ledgerRow: {
    dateLabel: string;
    counterparty: string;
    amountStr: string;
    isRevenue: boolean;
    paymentMethod: string;
    bookSheet: string;
    taxNote: string;
    itemsSummary: string;
  };
  outcome: 'recorded' | 'needs_review';
  questionText?: string;
}

const MEDIAN_COFFEE_PRICE = 180_000;

const SCENARIOS: Record<Exclude<WorkbenchScenarioId, 'live_sandbox'>, WorkbenchScenario> = {
  receipt_clean: {
    id: 'receipt_clean',
    tabLabel: 'Hóa đơn giấy',
    tabTag: 'S2d-HKD',
    inputTypeLabel: 'Ảnh hóa đơn mua hàng',
    inputIcon: 'receipt_long',
    inputHeader: 'Đại lý Cà phê Minh Phát — Phiếu giao hàng #104',
    inputLines: [
      'Ngày: 12/11/2026 • Hình thức: Tiền mặt',
      'Cà phê rang xay hạt Mộc: 5 kg × 180.000 đ = 900.000 đ',
      'Tổng cộng thanh toán: Chín trăm nghìn đồng chẵn',
    ],
    pythonCheckLabel: 'Kiểm toán số học & Lịch sử giá',
    pythonCheckFormula: '5 × 180.000 = 900.000 đ (Khớp 100%) • Chênh lệch trung vị: 0%',
    pythonCheckPassed: true,
    steps: [
      {
        code: 'RECEIVE',
        title: 'Tiếp nhận ảnh hóa đơn viết tay',
        detail: 'Định tuyến chứng từ mua hàng đầu vào sang bộ bóc tách ảnh.',
        icon: 'photo_camera',
        tone: 'indigo',
      },
      {
        code: 'EXTRACT',
        title: 'Gemini Vision bóc tách 1 dòng hàng hóa',
        detail: 'Đọc tên NCC "Cà phê Minh Phát", SL 5 kg, đơn giá 180.000 đ (tin cậy 97%).',
        icon: 'document_scanner',
        tone: 'indigo',
      },
      {
        code: 'NORMALIZE',
        title: 'Chuẩn hóa ngày & tiền Việt Nam',
        detail: 'Chuẩn hóa ngày 2026-11-12 và khớp chữ viết tay "chín trăm nghìn".',
        icon: 'tune',
        tone: 'indigo',
      },
      {
        code: 'AUDIT_MATH',
        title: 'Python kiểm toán tổng & giá nhập lịch sử',
        detail: '5 × 180.000 = 900.000 đ hợp lệ. Đơn giá bằng đúng trung vị 30 ngày gần nhất.',
        icon: 'calculate',
        tone: 'emerald',
      },
      {
        code: 'CLASSIFY',
        title: 'Phân loại sổ S2d-HKD (Thông tư 152)',
        detail: 'Xếp vào Chi phí vật liệu / hàng hóa kinh doanh, lưu kèm ảnh gốc.',
        icon: 'account_balance',
        tone: 'indigo',
      },
      {
        code: 'STAMP',
        title: 'Đóng dấu ghi sổ tự động',
        detail: 'Không có cảnh báo trùng hoặc sai số học. Đã ghi nhận vào sổ kế toán.',
        icon: 'verified',
        tone: 'emerald',
      },
    ],
    ledgerRow: {
      dateLabel: '12/11',
      counterparty: 'Đại lý Cà phê Minh Phát',
      amountStr: '-900.000 đ',
      isRevenue: false,
      paymentMethod: 'Tiền mặt',
      bookSheet: 'S2d-HKD (Vật liệu / Hàng hóa)',
      taxNote: 'Chi phí hợp lệ đầu vào',
      itemsSummary: 'Cà phê rang xay hạt Mộc (SL: 5 kg × 180.000 đ)',
    },
    outcome: 'recorded',
  },
  cross_transfer: {
    id: 'cross_transfer',
    tabLabel: 'VietQR trùng chéo',
    tabTag: 'CROSS_DUPLICATE',
    inputTypeLabel: 'Ảnh chụp chuyển khoản ngân hàng',
    inputIcon: 'qr_code_2',
    inputHeader: 'Biên lai chuyển khoản VietQR — MB Bank',
    inputLines: [
      'Thời gian: 12/11/2026 • 14:22',
      'Số tiền: -900.000 VND • Người nhận: PHAM VAN MINH',
      'Nội dung CK: TT tien ca phe Minh Phat ngay 12/11',
    ],
    pythonCheckLabel: 'Đối chiếu chéo chứng từ đa nguồn',
    pythonCheckFormula: 'Khớp số tiền 900.000 đ + trùng tên "Minh Phát" với #TX-104 (trong 24h)',
    pythonCheckPassed: false,
    steps: [
      {
        code: 'RECEIVE',
        title: 'Tiếp nhận ảnh màn hình VietQR',
        detail: 'Phân loại đây là chứng từ thanh toán chuyển khoản ngân hàng.',
        icon: 'content_paste_go',
        tone: 'indigo',
      },
      {
        code: 'EXTRACT',
        title: 'Gemini Vision đọc biến động số dư',
        detail: 'Trích xuất 900.000 đ, người thụ hưởng PHAM VAN MINH, mã FT263168.',
        icon: 'document_scanner',
        tone: 'indigo',
      },
      {
        code: 'CROSS_CHECK',
        title: 'Python rà soát sổ ±3 ngày quanh 12/11',
        detail: 'Phát hiện trùng với hóa đơn giấy Minh Phát 900.000 đ vừa ghi sổ buổi sáng.',
        icon: 'compare_arrows',
        tone: 'crimson',
      },
      {
        code: 'HOLD',
        title: 'Khóa tự động ghi sổ để chống trùng chi phí',
        detail: 'Ngăn tình trạng một giao dịch bị tính thuế / trừ chi phí hai lần.',
        icon: 'pause_circle',
        tone: 'crimson',
      },
      {
        code: 'PROMPT',
        title: 'Tạo câu hỏi xác minh bằng tiếng Việt',
        detail: 'Soạn lời hỏi rõ ràng kèm nút đọc thành tiếng cho chủ hộ lớn tuổi.',
        icon: 'record_voice_over',
        tone: 'amber',
      },
      {
        code: 'WAIT_USER',
        title: 'Chờ chủ hộ chọn Gộp hoặc Ghi riêng',
        detail: 'Giữ chứng từ ở mục Cần hỏi lại cho tới khi chủ hộ bấm xác nhận.',
        icon: 'fact_check',
        tone: 'crimson',
      },
    ],
    ledgerRow: {
      dateLabel: '12/11',
      counterparty: 'PHAM VAN MINH (CK VietQR)',
      amountStr: '-900.000 đ',
      isRevenue: false,
      paymentMethod: 'CK / VietQR',
      bookSheet: 'S2d-HKD (Chờ xác nhận gộp)',
      taxNote: 'Cảnh báo CROSS_DUPLICATE với #TX-104',
      itemsSummary: 'TT tien ca phe Minh Phat ngay 12/11',
    },
    outcome: 'needs_review',
    questionText:
      'Sáng nay sổ đã ghi Hóa đơn Cà phê Minh Phát 900.000 đ. Khoản chuyển khoản này thanh toán cho hóa đơn đó hay là đơn hàng mới?',
  },
  voice_vn: {
    id: 'voice_vn',
    tabLabel: 'Giọng nói vùng miền',
    tabTag: 'S2a-HKD',
    inputTypeLabel: 'Ghi âm tiếng Việt tự nhiên',
    inputIcon: 'mic',
    inputHeader: 'Câu lệnh thoại tại quầy — Giọng Miền Trung',
    inputLines: [
      '"Sáng ni bán được 20 tô mì Quảng với 12 ly trà đá,',
      'khách trả tiền mặt tổng cộng 820 nghìn đồng."',
      'Kênh thu: Tiền mặt tại cửa hàng • 12/11/2026',
    ],
    pythonCheckLabel: 'Kiểm toán số lượng & Định mức thuế TT152',
    pythonCheckFormula: '(20 × 35.000) + (12 × 10.000) = 820.000 đ • Thuế 4.5% = 36.900 đ',
    pythonCheckPassed: true,
    steps: [
      {
        code: 'RECEIVE',
        title: 'Nhận đoạn ghi âm qua Micro điện thoại',
        detail: 'Không cần gõ bàn phím hay nhớ danh mục tài khoản kế toán.',
        icon: 'mic',
        tone: 'indigo',
      },
      {
        code: 'AUDIO_NLP',
        title: 'Gemini Audio hiểu phương ngữ Miền Trung',
        detail: 'Chuẩn hóa "Sáng ni" -> 12/11/2026, "820 nghìn" -> 820.000 đ, phân tách 2 món.',
        icon: 'graphic_eq',
        tone: 'indigo',
      },
      {
        code: 'AUDIT_MATH',
        title: 'Python kiểm tra khớp tổng lời nói',
        detail: '700.000 đ (Mì Quảng) + 120.000 đ (Trà đá) = 820.000 đ chính xác.',
        icon: 'calculate',
        tone: 'emerald',
      },
      {
        code: 'TAX_TT152',
        title: 'Áp thuế suất Nhóm 2 (Dịch vụ ăn uống)',
        detail: 'GTGT 3.0% + TNCN 1.5% = 4.5% -> Thuế ước tính kỳ này 36.900 đ.',
        icon: 'percent',
        tone: 'indigo',
      },
      {
        code: 'LEDGER_S1',
        title: 'Ghi dòng Doanh thu vào sổ S2a-HKD',
        detail: 'Lưu kèm câu thoại gốc để đối chiếu dòng tiền với ngân hàng.',
        icon: 'menu_book',
        tone: 'indigo',
      },
      {
        code: 'STAMP',
        title: 'Đóng dấu ghi sổ hoàn tất',
        detail: 'Sổ S2a-HKD cập nhật cộng dồn doanh thu trong ngày tức thì.',
        icon: 'verified',
        tone: 'emerald',
      },
    ],
    ledgerRow: {
      dateLabel: '12/11',
      counterparty: 'Bán lẻ tại quán (Đoạn thoại)',
      amountStr: '+820.000 đ',
      isRevenue: true,
      paymentMethod: 'Tiền mặt',
      bookSheet: 'S2a-HKD (Doanh thu bán hàng)',
      taxNote: 'Nhóm 2 • GTGT 3% + TNCN 1.5% (36.900 đ)',
      itemsSummary: 'Mì Quảng (20 tô) • Trà đá (12 ly)',
    },
    outcome: 'recorded',
  },
};

function formatCurrencyVi(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')} đ`;
}

const TAB_ITEMS: Array<{ id: WorkbenchScenarioId; label: string; tag: string }> = [
  { id: 'cross_transfer', label: 'VietQR trùng chéo', tag: 'CROSS_DUPLICATE' },
  { id: 'receipt_clean', label: 'Hóa đơn giấy', tag: 'S2d-HKD' },
  { id: 'voice_vn', label: 'Giọng nói', tag: 'S2a-HKD' },
  { id: 'live_sandbox', label: 'Thử tương tác', tag: 'LIVE_SANDBOX' },
];

export function AuditWorkbench() {
  const [selectedId, setSelectedId] = useState<WorkbenchScenarioId>('live_sandbox');
  const [visibleSteps, setVisibleSteps] = useState<number>(6);
  const [replayNonce, setReplayNonce] = useState<number>(0);
  const [resolution, setResolution] = useState<'pending' | 'merged' | 'separate'>('pending');

  /* Interactive Sandbox state (Stripe Telemetry + Linear Code Diff aesthetic) */
  const [sandboxPartner, setSandboxPartner] = useState<string>('Nhà phân phối Cà phê Minh Phát');
  const [sandboxQty, setSandboxQty] = useState<number>(5);
  const [sandboxUnitPrice, setSandboxUnitPrice] = useState<number>(250_000);
  const [sandboxSimulateDup, setSandboxSimulateDup] = useState<boolean>(false);

  const isSandbox = selectedId === 'live_sandbox';
  const scenario = isSandbox ? SCENARIOS.receipt_clean : SCENARIOS[selectedId];

  useEffect(() => {
    setResolution('pending');
    if (isSandbox) {
      setVisibleSteps(6);
      return;
    }

    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setVisibleSteps(scenario.steps.length);
      return;
    }

    setVisibleSteps(1);
    let step = 1;
    const timer = window.setInterval(() => {
      step += 1;
      setVisibleSteps(step);
      if (step >= scenario.steps.length) {
        window.clearInterval(timer);
      }
    }, 420);

    return () => window.clearInterval(timer);
  }, [selectedId, replayNonce, isSandbox, scenario.steps.length]);

  /* Deterministic Python Sandbox audit calculation */
  const sandboxTotal = sandboxQty * sandboxUnitPrice;
  const priceDeviationPct = Math.round(
    ((sandboxUnitPrice - MEDIAN_COFFEE_PRICE) / MEDIAN_COFFEE_PRICE) * 100,
  );
  const hasPriceShock = priceDeviationPct > 30;
  const sandboxAlerts: string[] = [];
  if (sandboxSimulateDup) sandboxAlerts.push('CROSS_DUPLICATE');
  if (hasPriceShock) sandboxAlerts.push('PRICE_ANOMALY');
  const sandboxPassed = sandboxAlerts.length === 0 && sandboxPartner.trim().length > 1;

  /* 4-bar Stripe-inspired field completeness telemetry */
  const sandboxTelemetryBars = [
    { label: 'Tên chỗ mua', active: sandboxPartner.trim().length >= 3 },
    { label: 'Tiền × SL', active: sandboxQty > 0 && sandboxUnitPrice > 0 },
    { label: 'So giá cũ', active: !hasPriceShock },
    { label: 'Tránh trùng', active: !sandboxSimulateDup },
  ];

  const isComplete = isSandbox ? true : visibleSteps >= scenario.steps.length;
  const effectiveOutcome =
    selectedId === 'cross_transfer' && resolution !== 'pending' ? 'recorded' : scenario.outcome;

  return (
    <TooltipProvider>
      <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-xs">
        {/* Top Bar: Scenario Tabs with Shared Motion Pill & Replay */}
        <div className="flex flex-col items-stretch gap-2.5 border-b border-border bg-[#F6F8FB] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-6">
          <Tabs
            value={selectedId}
            onValueChange={(val) => setSelectedId(val as WorkbenchScenarioId)}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-slate-200/75 p-1 sm:inline-flex sm:w-auto sm:flex-wrap sm:justify-start">
              {TAB_ITEMS.map((item) => {
                const isActive = selectedId === item.id;
                return (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    className={`relative h-8 w-full cursor-pointer justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors data-active:bg-transparent data-active:shadow-none sm:w-auto sm:px-3 ${
                      isActive ? 'text-[#2E2396]' : 'text-[#334155] hover:text-[#111625]'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="workbench-tab-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                        className="absolute inset-0 rounded-md bg-white shadow-xs"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      {item.id === 'live_sandbox' && (
                        <AppIcon name="tune" className="text-sm text-[#2E2396]" />
                      )}
                      <span>{item.label}</span>
                      <span className="hidden font-mono text-xs text-[#475569] xl:inline">
                        ({item.tag})
                      </span>
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {!isSandbox ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReplayNonce((n) => n + 1)}
                    className="h-8 self-start text-xs font-semibold text-[#2E2396] sm:self-center"
                  />
                }
              >
                <AppIcon name="replay" className="text-base" />
                Chạy lại luồng kiểm toán
              </TooltipTrigger>
              <TooltipContent>
                Mô phỏng lại quy trình 6 bước từ tiếp nhận chứng từ tới đóng dấu ghi sổ
              </TooltipContent>
            </Tooltip>
          ) : (
            <Badge
              variant="outline"
              className="self-start border-[#2E2396]/30 bg-white font-mono text-[#2E2396] sm:self-center"
            >
              Thử chỉnh số xem kiểm tra trực tiếp
            </Badge>
          )}
        </div>

        {/* Main Split Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left Pane: Either Interactive Sandbox Controls OR Step-by-Step Timeline */}
          <div className="min-w-0 border-b border-border p-5 sm:p-6 lg:col-span-6 lg:border-r lg:border-b-0">
            {isSandbox ? (
              <div className="space-y-5">
                <div className="bg-[#F6F8FB] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2E2396]">
                      <AppIcon name="edit_note" className="text-base" />
                      Thử nhập như đang đứng ở quầy
                    </span>
                    <span className="font-mono text-xs text-[#475569]">
                      Giá tháng trước: 180.000 đ/kg
                    </span>
                  </div>

                  <div className="mt-3.5 space-y-3.5">
                    <div>
                      <label
                        htmlFor="sandbox-partner"
                        className="block text-xs font-semibold text-[#111625]"
                      >
                        Tên nhà cung cấp / Diễn giải
                      </label>
                      <Input
                        id="sandbox-partner"
                        type="text"
                        value={sandboxPartner}
                        onChange={(e) => setSandboxPartner(e.target.value)}
                        className="mt-1.5 bg-white text-sm font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="sandbox-qty"
                          className="flex items-center justify-between text-xs font-semibold text-[#111625]"
                        >
                          <span>Số lượng nhập</span>
                          <span className="font-mono font-bold text-[#2E2396] tabular-nums">
                            {sandboxQty} kg
                          </span>
                        </label>
                        <input
                          id="sandbox-qty"
                          type="range"
                          min={1}
                          max={20}
                          value={sandboxQty}
                          onChange={(e) => setSandboxQty(Number(e.target.value))}
                          className="mt-2.5 h-2 w-full cursor-pointer accent-[#2E2396]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="sandbox-price"
                          className="flex items-center justify-between text-xs font-semibold text-[#111625]"
                        >
                          <span>Đơn giá / kg</span>
                          <span
                            className={`font-mono font-bold tabular-nums ${
                              hasPriceShock ? 'text-[#92400E]' : 'text-[#0B6E54]'
                            }`}
                          >
                            {formatCurrencyVi(sandboxUnitPrice)}
                          </span>
                        </label>
                        <input
                          id="sandbox-price"
                          type="range"
                          min={150000}
                          max={320000}
                          step={10000}
                          value={sandboxUnitPrice}
                          onChange={(e) => setSandboxUnitPrice(Number(e.target.value))}
                          className="mt-2.5 h-2 w-full cursor-pointer accent-[#2E2396]"
                        />
                      </div>
                    </div>

                    {/* Shopify-Editions-inspired Quick /command Prompt Chips */}
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-medium text-[#475569]">
                        Bấm nhanh một tình huống thử:
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={sandboxUnitPrice === 180000 && !sandboxSimulateDup ? 'default' : 'outline'}
                          onClick={() => {
                            setSandboxUnitPrice(180000);
                            setSandboxSimulateDup(false);
                          }}
                          className="h-8 font-mono text-xs font-semibold"
                        >
                          /nhập-chuẩn-180k
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSandboxUnitPrice(250000)}
                          className={`h-8 font-mono text-xs font-semibold ${
                            sandboxUnitPrice === 250000
                              ? 'border-[#92400E]/45 bg-amber-50 text-[#92400E] hover:bg-amber-100'
                              : ''
                          }`}
                        >
                          /thử-nhầm-giá-250k
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={sandboxSimulateDup ? 'destructive-solid' : 'outline'}
                          onClick={() => setSandboxSimulateDup((v) => !v)}
                          className="h-8 font-mono text-xs font-semibold"
                        >
                          <AppIcon name="compare_arrows" className="text-sm" />
                          {sandboxSimulateDup ? '/đang-trùng-vietqr' : '/thử-trùng-vietqr'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stripe-inspired 4-segment Audit Integrity Meter */}
                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#111625]">
                    <span>Kiểm tra an toàn trước khi lưu sổ</span>
                    <span
                      className={`font-mono ${
                        sandboxPassed ? 'text-[#0B6E54]' : 'text-[#B91C1C]'
                      }`}
                    >
                      {sandboxPassed ? '4/4 mục an toàn' : `Dừng lại: có ${sandboxAlerts.length} cảnh báo`}
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {sandboxTelemetryBars.map((seg, idx) => (
                      <motion.div
                        key={seg.label}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.25 }}
                        transition={{
                          duration: 0.4,
                          delay: 0.06 * idx,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="space-y-1.5"
                      >
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                          <motion.div
                            initial={{ scaleX: 0 }}
                            whileInView={{ scaleX: 1 }}
                            viewport={{ once: true, amount: 0.25 }}
                            transition={{
                              duration: 0.52,
                              delay: 0.08 * idx,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                            style={{ originX: 0 }}
                            className={`h-full w-full rounded-full transition-colors duration-200 ${
                              seg.active ? 'bg-[#0B6E54]' : 'bg-[#B91C1C]/80'
                            }`}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs font-medium text-[#475569]">
                          <span className="truncate">{seg.label}</span>
                          <AppIcon
                            name={seg.active ? 'check_circle' : 'warning'}
                            className={`text-xs ${
                              seg.active ? 'text-[#0B6E54]' : 'text-[#B91C1C]'
                            }`}
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-[#F6F8FB] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#2E2396]">
                    <span className="inline-flex items-center gap-1.5">
                      <AppIcon name={scenario.inputIcon} className="text-base" />
                      {scenario.inputTypeLabel}
                    </span>
                    <span className="font-mono text-xs text-[#475569]">Đầu vào mẫu</span>
                  </div>
                  <h3 className="mt-2.5 text-sm font-bold text-[#111625]">{scenario.inputHeader}</h3>
                  <ul className="mt-2 space-y-1 text-xs text-[#475569]">
                    {scenario.inputLines.map((line, i) => (
                      <li key={i} className="font-mono text-xs leading-relaxed">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tracking-wide text-[#475569] uppercase">
                      Nhật ký xử lý theo thời gian thực
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#2E2396] tabular-nums">
                      {!isComplete && (
                        <span className="audit-live-dot inline-block h-2 w-2 rounded-full bg-[#2E2396]" />
                      )}
                      Bước {Math.min(visibleSteps, scenario.steps.length)}/{scenario.steps.length}
                    </span>
                  </div>

                  <div className="divide-y divide-border border-t border-b border-border">
                    {scenario.steps.slice(0, visibleSteps).map((step, idx) => {
                      const isLatest = idx === visibleSteps - 1 && !isComplete;
                      const iconTone =
                        step.tone === 'crimson'
                          ? 'bg-red-50 text-[#B91C1C]'
                          : step.tone === 'emerald'
                            ? 'bg-emerald-50 text-[#0B6E54]'
                            : step.tone === 'amber'
                              ? 'bg-amber-50 text-[#92400E]'
                              : 'bg-[#E8ECF6] text-[#2E2396]';
                      return (
                        <motion.div
                          key={`${selectedId}-${replayNonce}-${step.code}`}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.36,
                            delay: Math.min(idx * 0.04, 0.24),
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className={`flex items-start gap-3 px-2 py-3 ${
                            isLatest ? 'bg-[#F6F8FB]' : ''
                          }`}
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTone}`}
                          >
                            <AppIcon name={step.icon} className="text-base" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[#111625]">{step.title}</span>
                              <span className="font-mono text-xs font-medium text-[#475569]">
                                {step.code}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-[#475569]">
                              {step.detail}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Pane: Deterministic Python Diff + Live Ruled Paper Ledger */}
          <div className="flex min-w-0 flex-col justify-between bg-[#F6F8FB]/70 p-5 sm:p-6 lg:col-span-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={isSandbox ? `sandbox-${sandboxPassed}-${sandboxAlerts.join('-')}` : selectedId}
                initial={{ opacity: 0.72, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0.72, y: -4 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-4"
              >
                {isSandbox ? (
                  /* Linear Code-Diff Style Deterministic Audit Feed */
                  <div className="overflow-hidden border border-border bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[#F6F8FB] px-3.5 py-2.5 sm:px-4">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#111625]">
                        <AppIcon name="terminal" className="text-sm text-[#2E2396]" />
                        python_auditor.py — Kiểm toán trực tiếp
                      </span>
                      <Badge variant={sandboxPassed ? 'emerald' : 'destructive'}>
                        {sandboxPassed ? 'PASS — GHI SỔ' : 'HOLD — CẦN HỎI LẠI'}
                      </Badge>
                    </div>
                    <div className="divide-y divide-border font-mono text-xs">
                      <div className="flex flex-col gap-0.5 bg-emerald-50/55 px-3.5 py-2 text-[#0B6E54] sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4">
                        <span>+ computed_total_vnd</span>
                        <span className="font-bold tabular-nums">
                          {sandboxQty} × {formatCurrencyVi(sandboxUnitPrice)} ={' '}
                          <OdometerNumber value={formatCurrencyVi(sandboxTotal)} />
                        </span>
                      </div>
                      <div
                        className={`flex flex-col gap-0.5 px-3.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 ${
                          hasPriceShock
                            ? 'bg-amber-50 text-[#92400E]'
                            : 'bg-white text-[#475569]'
                        }`}
                      >
                        <span>{hasPriceShock ? '! price_deviation' : '  price_deviation'}</span>
                        <span className="font-bold tabular-nums">
                          {priceDeviationPct >= 0 ? `+${priceDeviationPct}%` : `${priceDeviationPct}%`}{' '}
                          (Ngưỡng khóa: +30%)
                        </span>
                      </div>
                      <div
                        className={`flex flex-col gap-0.5 px-3.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 ${
                          sandboxSimulateDup
                            ? 'bg-red-50 text-[#B91C1C]'
                            : 'bg-white text-[#475569]'
                        }`}
                      >
                        <span>
                          {sandboxSimulateDup ? '- cross_duplicate_flag' : '  cross_duplicate_flag'}
                        </span>
                        <span className="font-bold">
                          {sandboxSimulateDup ? 'TRUE (Trùng #TX-104 ±3 ngày)' : 'FALSE'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`p-4 transition-colors ${
                      isComplete
                        ? scenario.pythonCheckPassed
                          ? 'bg-emerald-50/90'
                          : 'bg-red-50/90'
                        : 'bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#111625]">
                        <AppIcon name="terminal" className="text-base text-[#2E2396]" />
                        {scenario.pythonCheckLabel}
                      </span>
                      {isComplete && (
                        <Badge variant={scenario.pythonCheckPassed ? 'emerald' : 'destructive'}>
                          {scenario.pythonCheckPassed ? 'KHỚP 100%' : 'CẢNH BÁO TRÙNG'}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2.5 bg-white px-3 py-2 font-mono text-xs text-[#111625]">
                      {scenario.pythonCheckFormula}
                    </div>
                  </div>
                )}

                {/* Simulated Vietnamese Lined Ledger Row ("Sổ Ô Ly") */}
                <div className="notebook-ledger overflow-hidden border-t border-b border-border">
                  <div className="flex flex-col items-start gap-1 border-b border-border bg-[#FFFDF5] px-4 py-2.5 pl-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:pl-16">
                    <span className="text-xs font-bold text-[#111625]">
                      Kết quả dự kiến trên Sổ Kế toán Ô Ly
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#2E2396]">
                      {isSandbox
                        ? 'S2d-HKD (Vật liệu / Hàng hóa)'
                        : scenario.ledgerRow.bookSheet}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 px-4 py-3.5 pl-6 sm:flex-row sm:flex-nowrap sm:items-start sm:gap-3 sm:py-4 sm:pl-4">
                    <div className="flex items-center gap-2 sm:block sm:w-16 sm:shrink-0 sm:text-center">
                      <div className="font-mono text-xs font-bold text-[#111625] tabular-nums">
                        12/11
                      </div>
                      <div className="inline-block rounded bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-[#111625] sm:mt-1">
                        {isSandbox
                          ? sandboxSimulateDup
                            ? 'CK/QR'
                            : 'Tiền mặt'
                          : scenario.ledgerRow.paymentMethod}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 sm:pl-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[#111625]">
                          {isSandbox
                            ? sandboxPartner.trim() || 'Nhà cung cấp mới'
                            : selectedId === 'cross_transfer' && resolution === 'merged'
                              ? 'Đại lý Cà phê Minh Phát (Đã gộp #TX-104)'
                              : scenario.ledgerRow.counterparty}
                        </span>
                        {!isSandbox && selectedId === 'cross_transfer' && resolution === 'merged' && (
                          <Badge variant="secondary" className="text-[#2E2396]">
                            <AppIcon name="link" className="text-xs" />
                            Đối chiếu kép
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[#475569]">
                        {isSandbox
                          ? `Cà phê rang xay (SL: ${sandboxQty} kg × ${formatCurrencyVi(sandboxUnitPrice)})`
                          : scenario.ledgerRow.itemsSummary}
                      </p>
                      <div
                        className={`mt-2 text-xs font-semibold ${
                          isSandbox && !sandboxPassed ? 'text-[#B91C1C]' : 'text-[#2E2396]'
                        }`}
                      >
                        {isSandbox
                          ? sandboxAlerts.length > 0
                            ? `Tạm dừng vì: ${sandboxAlerts.join(' + ')}`
                            : 'Hợp lệ — tự động cộng dồn tồn kho S2d-HKD'
                          : scenario.ledgerRow.taxNote}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/60 pt-2.5 sm:block sm:shrink-0 sm:border-0 sm:pt-0 sm:text-right">
                      <div
                        className={`font-mono text-base font-extrabold tabular-nums ${
                          !isSandbox && scenario.ledgerRow.isRevenue
                            ? 'text-[#0B6E54]'
                            : 'text-[#111625]'
                        }`}
                      >
                        {isSandbox ? (
                          <OdometerNumber value={`-${formatCurrencyVi(sandboxTotal)}`} />
                        ) : (
                          scenario.ledgerRow.amountStr
                        )}
                      </div>

                      <div className="min-h-[28px] sm:mt-2">
                        {isSandbox ? (
                          sandboxPassed ? (
                            <span className="stamp-drop inline-block">
                              <Stamp animate={false} />
                            </span>
                          ) : (
                            <Badge variant="destructive" className="font-bold">
                              CẦN HỎI LẠI
                            </Badge>
                          )
                        ) : !isComplete ? (
                          <Badge variant="outline" className="text-[#475569]">
                            Đang kiểm toán...
                          </Badge>
                        ) : effectiveOutcome === 'recorded' ? (
                          <span className="stamp-drop inline-block">
                            <Stamp animate={false} />
                          </span>
                        ) : (
                          <Badge variant="destructive" className="stamp-drop font-bold">
                            CẦN HỎI LẠI
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Warning Explain for Interactive Sandbox */}
                {isSandbox && sandboxAlerts.length > 0 && (
                  <div className="bg-[#FFFDF5] p-4 text-xs leading-relaxed text-[#111625]">
                    <span className="font-bold text-[#B91C1C]">Câu hỏi Keiki sẽ hỏi chủ hộ: </span>
                    {sandboxSimulateDup
                      ? 'Khoản chuyển khoản VietQR này có thanh toán cho hóa đơn giấy #TX-104 hay là đơn mới? '
                      : ''}
                    {hasPriceShock
                      ? `Đơn giá ${formatCurrencyVi(sandboxUnitPrice)} đang cao hơn ${priceDeviationPct}% so với giá tháng trước (180.000 đ). Bạn kiểm tra lại xem có lỡ bấm dư số không nhé?`
                      : ''}
                  </div>
                )}

                {/* Interactive Resolution Widget for Cross Duplicate Preset */}
                {!isSandbox && isComplete && selectedId === 'cross_transfer' && scenario.questionText && (
                  <div className="audit-step-enter bg-[#FFFDF5] p-4">
                    <div className="flex items-start gap-2.5">
                      <AppIcon name="psychology_alt" className="mt-0.5 shrink-0 text-xl text-[#B91C1C]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold leading-relaxed text-[#111625]">
                          "{scenario.questionText}"
                        </p>
                        <div className="mt-2 text-xs font-semibold text-[#B91C1C]">
                          Câu hỏi xác minh tự động từ Keiki
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={resolution === 'merged' ? 'default' : 'outline'}
                            onClick={() => setResolution('merged')}
                          >
                            <AppIcon name="merge" className="text-sm" />
                            Đúng, gộp vào hóa đơn #TX-104
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={resolution === 'separate' ? 'emerald' : 'outline'}
                            onClick={() => setResolution('separate')}
                          >
                            <AppIcon name="check_circle" className="text-sm" />
                            Không, ghi đơn mới
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-5">
              <Separator className="mb-3" />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569]">
                <span>Mô phỏng dựa trên quy trình kiểm toán 6 bước thực tế</span>
                <span className="font-mono font-semibold text-[#0B6E54]">Dữ liệu mẫu cục bộ</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
}
