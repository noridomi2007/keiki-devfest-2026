import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '../api/endpoints';
import { OdometerNumber } from '../components/OdometerNumber';
import { vi } from '../i18n/vi';
import type { ReportResponse } from '../types/contract';
import { formatVnd } from '../utils/money';
import { speakVietnamese } from '../utils/speech';
import { AppIcon } from '@/components/AppIcon';

export function ReportPage() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [month, setMonth] = useState('2026-11');
  const [loading, setLoading] = useState(true);
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const loadReport = async (targetMonth: string, isMounted = () => true) => {
    setLoading(true);
    try {
      const res = await api.getReport(targetMonth);
      if (isMounted()) setReport(res);
    } finally {
      if (isMounted()) setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    void loadReport(month, () => mounted);
    return () => {
      mounted = false;
    };
  }, [month]);

  const handleTogglePeriodLock = async () => {
    if (!report) return;
    setLockBusy(true);
    setLockError(null);
    try {
      const currentlyLocked = Boolean(report.period_lock?.locked);
      if (currentlyLocked) {
        await api.unlockPeriod(month);
      } else {
        await api.lockPeriod(month);
      }
      await loadReport(month);
    } catch (err) {
      setLockError((err as Error).message || 'Không thể cập nhật trạng thái khóa kỳ.');
    } finally {
      setLockBusy(false);
    }
  };

  if (loading || !report) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="space-y-2 p-4">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-28" />
            </Card>
          ))}
        </div>
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </Card>
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-36 w-full" />
        </Card>
      </div>
    );
  }

  const maxTopItem = Math.max(...report.top_items.map((i) => i.total_vnd), 1);
  const ratioPct = Math.max(0, Math.min(100, report.loan_readiness.verified_ratio_pct));
  const gaugeRadius = 42;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeDashOffset = gaugeCircumference * (1 - ratioPct / 100);

  return (
    <div className="space-y-5">
      {/* KPI Cards with Odometer Numbers & Gradient Top Accents */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Card className="card-interactive relative gap-1 overflow-hidden p-4">
          <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-[#0B6E54] to-emerald-400" />
          <div className="flex items-center justify-between text-xs font-bold text-[#475569]">
            <span>Doanh thu trong kỳ</span>
            <AppIcon name="trending_up" className="text-base text-[#0B6E54]" />
          </div>
          <div className="font-heading text-xl font-extrabold text-[#0B6E54] tabular-nums">
            <OdometerNumber value={formatVnd(report.totals.revenue_vnd)} />
          </div>
          <div className="text-xs text-[#475569]">Mẫu S1a / S2a-HKD (Đã ghi sổ)</div>
        </Card>

        <Card className="card-interactive relative gap-1 overflow-hidden p-4">
          <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-[#B91C1C] to-rose-400" />
          <div className="flex items-center justify-between text-xs font-bold text-[#475569]">
            <span>Chi phí sản xuất KD</span>
            <AppIcon name="receipt_long" className="text-base text-[#B91C1C]" />
          </div>
          <div className="font-heading text-xl font-extrabold text-[#B91C1C] tabular-nums">
            <OdometerNumber value={formatVnd(report.totals.expense_vnd)} />
          </div>
          <div className="text-xs text-[#475569]">Mẫu S2c &amp; S2d-HKD</div>
        </Card>

        <Card className="card-interactive relative gap-1 overflow-hidden p-4">
          <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-[#2E2396] to-indigo-400" />
          <div className="flex items-center justify-between text-xs font-bold text-[#475569]">
            <span>Lợi nhuận ròng tạm tính</span>
            <AppIcon name="account_balance_wallet" className="text-base text-[#2E2396]" />
          </div>
          <div className="font-heading text-xl font-extrabold text-[#2E2396] tabular-nums">
            <OdometerNumber value={formatVnd(report.totals.profit_vnd)} />
          </div>
          <div className="text-xs text-[#475569]">Doanh thu − Chi phí</div>
        </Card>

        <Card className="card-interactive relative gap-1 overflow-hidden p-4">
          <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-amber-500 to-orange-400" />
          <div className="flex items-center justify-between text-xs font-bold text-[#475569]">
            <span>Thuế HKD ước tính (TT 152)</span>
            <AppIcon name="calculate" className="text-base text-[#92400E]" />
          </div>
          <div className="font-heading text-xl font-extrabold text-[#92400E] tabular-nums">
            <OdometerNumber value={formatVnd(report.totals.estimated_tax_vnd)} />
          </div>
          <div className="text-xs text-[#475569]">GTGT + TNCN theo nhóm ngành</div>
        </Card>
      </div>

      {/* Gemini AI Executive Summary */}
      {report.summary_text && (
        <Card className="border-[#2E2396]/25 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AppIcon name="auto_awesome" className="text-2xl text-[#2E2396]" />
              <h3 className="font-heading font-bold text-[#111625]">
                Nhận xét của Trợ lý AI Keiki (Google Gemini)
              </h3>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => speakVietnamese(report.summary_text || '')}
              className="text-[#2E2396]"
            >
              <AppIcon name="volume_up" className="text-base" />
              Nghe đọc báo cáo
            </Button>
          </div>
          <p className="text-sm leading-relaxed text-[#111625]">{report.summary_text}</p>
        </Card>
      )}

      {/* Bank Loan Readiness & Transparent Bookkeeping Card */}
      <Card className="border-[#0B6E54]/30 bg-emerald-50/45 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 basis-[240px]">
            <h3 className="font-heading text-lg font-bold text-[#111625]">
              Độ tin cậy chứng từ đạt {report.loan_readiness.verified_ratio_pct}%
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
              Có <strong className="text-[#111625]">{report.loan_readiness.with_evidence_count}</strong> /{' '}
              {report.loan_readiness.total_recorded_count} bút toán đính kèm đầy đủ ảnh hóa đơn gốc
              hoặc ghi âm (trong đó có{' '}
              <strong className="text-[#111625]">
                {report.loan_readiness.cross_verified_count} bút toán đối chiếu kép
              </strong>{' '}
              khớp cả Hóa đơn giấy lẫn Biên lai chuyển khoản VietQR). Giúp hộ kinh doanh chứng minh
              dòng tiền thực tế khi vay vốn ngân hàng chính thống.
            </p>
            <div className="mt-3">
              <Badge
                variant="emerald"
                className="h-auto max-w-full whitespace-normal py-1 text-left leading-snug"
              >
                <AppIcon name="account_balance" className="shrink-0 text-sm" />
                <span>Hồ sơ Sổ sách Minh bạch — Tiếp cận Vốn vay Ngân hàng</span>
              </Badge>
            </div>
          </div>

          <div className="relative flex flex-col items-center justify-center rounded-2xl bg-white/95 px-5 py-4 text-center">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                <circle
                  cx="50"
                  cy="50"
                  r={gaugeRadius}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="8"
                />
                <motion.circle
                  cx="50"
                  cy="50"
                  r={gaugeRadius}
                  fill="none"
                  stroke="#0B6E54"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={gaugeCircumference}
                  initial={{ strokeDashoffset: gaugeCircumference }}
                  animate={{ strokeDashoffset: gaugeDashOffset }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
              <div className="font-heading absolute text-2xl font-extrabold text-[#0B6E54] tabular-nums">
                <OdometerNumber value={`${ratioPct}%`} />
              </div>
            </div>
            <div className="mt-1 text-xs font-bold text-[#475569]">Chứng từ hợp lệ</div>
          </div>
        </div>
      </Card>

      {/* Circular 152/2025/TT-BTC Export Section + Period Lock */}
      <Card className="border-[#2E2396]/35 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading inline-flex items-center gap-1.5 text-lg font-bold text-[#111625]">
                <AppIcon name="download" className="text-xl text-[#2E2396]" />
                Xuất Sổ Kế Toán Thông tư 152/2025/TT-BTC &amp; Khóa kỳ
              </h3>
              {report.period_lock?.locked ? (
                <Badge variant="emerald" className="font-bold">
                  <AppIcon name="lock" className="text-xs" />
                  Kỳ {month} đã chốt khóa
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-[#475569]">
                  Đang mở ghi sổ
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#475569]">
              Gồm 5 Sheet chính thức:{' '}
              <strong className="text-[#111625]">S2a-HKD (Doanh thu &amp; Thuế)</strong>,{' '}
              <strong className="text-[#111625]">S2c-HKD (Doanh thu &amp; Chi phí)</strong>,{' '}
              <strong className="text-[#111625]">S2d-HKD (Vật liệu/Hàng hóa N-X-T)</strong>,{' '}
              <strong className="text-[#111625]">S2e-HKD (Chi tiết Tiền mặt &amp; Ngân hàng)</strong>{' '}
              và <strong className="text-[#111625]">Hồ sơ Vay vốn Ngân hàng</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold text-[#475569]">Kỳ sổ:</label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 w-auto font-mono text-sm font-bold"
            />
            <Button
              type="button"
              size="sm"
              variant={report.period_lock?.locked ? 'outline' : 'secondary'}
              disabled={lockBusy}
              onClick={handleTogglePeriodLock}
              className="h-9 cursor-pointer text-xs font-bold"
            >
              <AppIcon name="lock" className="text-sm" />
              {report.period_lock?.locked ? 'Mở khóa kỳ' : 'Chốt & Khóa kỳ'}
            </Button>
          </div>
        </div>

        {lockError && (
          <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-[#B91C1C]">
            {lockError}
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap gap-3">
          <a
            href={`/api/export?month=${month}&evidence=false`}
            download
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2E2396] px-5 text-sm font-bold text-white shadow-xs transition hover:bg-[#231978]"
          >
            <AppIcon name="table_view" className="text-xl" />
            {vi.actions.exportExcel}
          </a>

          <a
            href={`/api/export?month=${month}&evidence=true`}
            download
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#0B6E54]/40 bg-emerald-50 px-5 text-sm font-bold text-[#0B6E54] transition hover:bg-emerald-100"
          >
            <AppIcon name="folder_zip" className="text-xl" />
            {vi.actions.exportZip}
          </a>
        </div>
      </Card>

      {/* Circular 152/2025/TT-BTC Threshold & Filing Deadline Card */}
      {report.tax_threshold && (() => {
        const th = report.tax_threshold;
        const pctOf3B = Math.min(
          Math.round((th.annualized_revenue_vnd / th.income_tax_method_threshold_vnd) * 100),
          100,
        );
        return (
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading inline-flex items-center gap-1.5 text-base font-bold text-[#111625]">
                    <AppIcon name="verified_user" className="text-lg text-[#0B6E54]" />
                    Theo dõi Ngưỡng Doanh thu Thông tư 152/2025/TT-BTC
                  </h3>
                  <Badge variant="secondary" className="font-mono text-xs font-bold">
                    {th.regime_code}
                  </Badge>
                </div>
                <p className="mt-1 text-xs font-semibold text-[#111625]">{th.status_label}</p>
                <p className="mt-0.5 text-xs text-[#475569]">
                  Doanh thu kỳ sổ:{' '}
                  <strong className="font-mono text-[#111625] tabular-nums">
                    {formatVnd(th.recorded_revenue_vnd)}
                  </strong>{' '}
                  • Quy đổi năm ước tính:{' '}
                  <strong className="font-mono text-[#2E2396] tabular-nums">
                    {formatVnd(th.annualized_revenue_vnd)}
                  </strong>
                </p>
              </div>

              <div className="text-right font-mono text-xs font-extrabold text-[#2E2396] tabular-nums">
                Mốc 500tr · 1 tỷ · 3 tỷ
              </div>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-[#2E2396] to-[#0B6E54] transition-all duration-500"
                style={{ width: `${Math.max(pctOf3B, 4)}%` }}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              <div className="rounded-xl bg-[#F6F8FB] p-3.5">
                <div className="font-bold text-[#111625]">Bộ sổ áp dụng theo nhóm doanh thu:</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {th.recommended_books.map((book) => (
                    <Badge key={book} variant="outline" className="bg-white font-mono text-[11px]">
                      {book}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-[#F6F8FB] p-3.5">
                <div className="font-bold text-[#111625]">Mốc kê khai &amp; Nghĩa vụ thuế:</div>
                <p className="mt-1 leading-relaxed text-[#475569]">{th.filing_deadline_note}</p>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Tax Breakdown Table by Industry Group (S2a-HKD) */}
      <Card className="min-w-0 gap-0 overflow-hidden py-0">
        <div className="border-b border-border bg-[#F6F8FB] px-4 py-3.5 sm:px-5">
          <h3 className="font-heading font-bold text-[#111625]">
            Bảng phân bổ Doanh thu &amp; Thuế ước tính (Mẫu S2a-HKD — TT 152/2025/TT-BTC)
          </h3>
          <p className="mt-1 text-xs font-medium text-[#475569] sm:hidden">
            Vuốt ngang bảng nếu cần xem đầy đủ số liệu từng cột
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/90 hover:bg-slate-50/90">
              <TableHead className="min-w-[130px] px-3 py-2.5 text-xs font-bold whitespace-normal text-[#334155] uppercase sm:px-5 sm:py-3">
                Nhóm ngành
              </TableHead>
              <TableHead className="px-2.5 py-2.5 text-right text-xs font-bold text-[#334155] uppercase sm:px-4 sm:py-3">
                Doanh thu
              </TableHead>
              <TableHead className="px-2.5 py-2.5 text-right text-xs font-bold text-[#334155] uppercase sm:px-4 sm:py-3">
                Thuế suất
              </TableHead>
              <TableHead className="px-3 py-2.5 text-right text-xs font-bold text-[#334155] uppercase sm:px-5 sm:py-3">
                Thuế ước tính
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.tax_breakdown.map((row) => (
              <TableRow key={row.tax_group}>
                <TableCell className="px-3 py-3 whitespace-normal font-medium leading-snug text-[#111625] sm:px-5">
                  {row.label}
                </TableCell>
                <TableCell className="px-2.5 py-3 text-right font-mono font-bold tabular-nums sm:px-4">
                  {formatVnd(row.revenue_vnd)}
                </TableCell>
                <TableCell className="px-2.5 py-3 text-right font-mono text-[#334155] tabular-nums sm:px-4">
                  {row.rate_pct}%
                </TableCell>
                <TableCell className="px-3 py-3 text-right font-mono font-bold text-[#2E2396] tabular-nums sm:px-5">
                  {formatVnd(row.tax_vnd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t border-border bg-[#F6F8FB] px-4 py-2.5 text-xs text-[#475569] sm:px-5">
          {report.tax_threshold?.disclaimer ||
            'Số liệu thuế mang tính ước tính tham khảo theo Thông tư 152/2025/TT-BTC, không thay thế Tờ khai thuế chính thức 01/CNKD.'}
        </div>
      </Card>

      {/* Top Items & Price Increase Alerts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-heading font-bold text-[#111625]">
            Khoản mục giao dịch lớn nhất trong kỳ
          </h3>
          <div className="space-y-3">
            {report.top_items.map((item, idx) => {
              const widthPct = Math.max(Math.round((item.total_vnd / maxTopItem) * 100), 8);
              return (
                <div key={idx}>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-[#111625]">{item.name}</span>
                    <span className="font-mono font-bold text-[#2E2396] tabular-nums">
                      {formatVnd(item.total_vnd)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ duration: 0.7, delay: idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
                      className="h-2.5 rounded-full bg-gradient-to-r from-[#2E2396] via-[#4F46E5] to-[#0B6E54]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-heading inline-flex items-center gap-1.5 font-bold text-[#111625]">
            <AppIcon name="warning" className="text-lg text-[#B91C1C]" />
            Cảnh báo mặt hàng biến động giá nhập (&gt; 30%)
          </h3>
          {report.price_increases.length === 0 ? (
            <p className="text-xs text-[#475569]">Không có mặt hàng nào tăng giá bất thường.</p>
          ) : (
            <div className="space-y-2.5">
              {report.price_increases.map((al, idx) => (
                <div key={idx} className="rounded-xl bg-red-50/80 p-3.5 text-xs">
                  <div className="font-bold text-[#B91C1C]">
                    {al.item} — Tăng +{al.pct}%
                  </div>
                  <div className="mt-0.5 text-[#111625]">
                    Nhà cung cấp: <strong>{al.counterparty}</strong>
                  </div>
                  <div className="mt-1 font-mono text-[#475569] tabular-nums">
                    Giá lịch sử trung vị: {formatVnd(al.old_vnd)} → Hóa đơn mới:{' '}
                    <strong className="text-[#B91C1C]">{formatVnd(al.new_vnd)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Empirical Evaluation Benchmark Card */}
      {report.eval_benchmark && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-heading inline-flex items-center gap-1.5 text-base font-bold text-[#111625]">
                <AppIcon name="fact_check" className="text-lg text-[#2E2396]" />
                Chỉ số Kiểm định Thực nghiệm (Empirical Benchmark —{' '}
                {report.eval_benchmark.scenarios_count} kịch bản chuẩn hóa)
              </h3>
              <p className="mt-0.5 text-xs text-[#475569]">
                Đo lường tự động qua bộ kiểm thử độc lập trên hóa đơn giấy, ảnh VietQR và giọng nói vùng miền.
              </p>
            </div>
            <Badge variant="emerald" className="font-mono text-xs font-bold">
              Latency TB: {report.eval_benchmark.avg_latency_ms} ms
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl bg-[#F6F8FB] p-3">
              <div className="text-[11px] font-medium text-[#475569]">Đúng số tiền</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold text-[#0B6E54] tabular-nums">
                {report.eval_benchmark.amount_accuracy_pct}%
              </div>
            </div>
            <div className="rounded-xl bg-[#F6F8FB] p-3">
              <div className="text-[11px] font-medium text-[#475569]">Đúng ngày CT</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold text-[#0B6E54] tabular-nums">
                {report.eval_benchmark.date_accuracy_pct}%
              </div>
            </div>
            <div className="rounded-xl bg-[#F6F8FB] p-3">
              <div className="text-[11px] font-medium text-[#475569]">Tự ghi chính xác</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold text-[#2E2396] tabular-nums">
                {report.eval_benchmark.auto_record_precision_pct}%
              </div>
            </div>
            <div className="rounded-xl bg-[#F6F8FB] p-3">
              <div className="text-[11px] font-medium text-[#475569]">Bắt trùng VietQR</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold text-[#2E2396] tabular-nums">
                {report.eval_benchmark.cross_duplicate_recall_pct}%
              </div>
            </div>
            <div className="col-span-2 rounded-xl bg-[#F6F8FB] p-3 sm:col-span-1">
              <div className="text-[11px] font-medium text-[#475569]">Đúng quyết định</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold text-[#0B6E54] tabular-nums">
                {report.eval_benchmark.decision_accuracy_pct}%
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
