import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { JobEventRecord, Transaction } from '../types/contract';
import { formatVnd } from '../utils/money';
import { speakVietnamese } from '../utils/speech';
import { Stamp } from './Stamp';
import { AppIcon } from '@/components/AppIcon';

interface AgentTimelineProps {
  events: JobEventRecord[];
  isRunning: boolean;
  finalDecision: 'recorded' | 'needs_review' | null;
  resultTransaction: Transaction | null;
  onOpenReviewTab: () => void;
  onOpenLedgerTab: () => void;
}

const STEP_LABELS: Record<string, string> = {
  receive: '1. Tiếp nhận chứng từ',
  quality_check: '2. Kiểm tra độ nét & định dạng',
  extract: '3. Google Gemini đọc đa phương thức',
  normalize: '4. Chuẩn hóa tiền tệ VND & phân loại thuế',
  validate: '5. Kiểm toán tổng tiền, lịch sử giá & trùng chéo',
  decide: '6. Ra quyết định kế toán',
  save: '7. Lưu vào sổ Firestore',
  done: '8. Hoàn tất',
};

export function AgentTimeline({
  events,
  isRunning,
  finalDecision,
  resultTransaction,
  onOpenReviewTab,
  onOpenLedgerTab,
}: AgentTimelineProps) {
  if (events.length === 0 && !isRunning) {
    return null;
  }

  return (
    <Card aria-live="polite" className="mt-5 gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border bg-[#F6F8FB] px-5 py-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <AppIcon name="auto_awesome" className="text-xl text-[#2E2396]" />
          <div className="min-w-0">
            <CardTitle className="text-sm font-bold text-[#111625]">
              Tiến trình Trợ lý Kiểm toán Keiki
            </CardTitle>
            <p className="text-xs text-[#475569]">
              Gemini đọc hiểu đa phương thức • Python kiểm toán số học
            </p>
          </div>
        </div>
        {isRunning && (
          <Badge variant="outline" className="border-[#2E2396]/30 text-[#2E2396]">
            <span className="audit-live-dot h-2 w-2 rounded-full bg-[#2E2396]" />
            Đang xử lý
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        <ol className="space-y-2">
          {events.map((ev) => {
            const icon =
              ev.status === 'ok'
                ? 'check_circle'
                : ev.status === 'warn'
                ? 'warning'
                : ev.status === 'error'
                ? 'error'
                : 'pending';
            const color =
              ev.status === 'ok'
                ? 'text-[#0B6E54]'
                : ev.status === 'warn' || ev.status === 'error'
                ? 'text-[#B91C1C]'
                : 'text-[#2E2396]';

            return (
              <li
                key={`${ev.seq}-${ev.step}`}
                className="audit-step-enter flex items-start gap-2.5 rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 text-sm"
              >
                <AppIcon name={icon} className={`mt-0.5 text-lg ${color}`} />
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-[#111625]">
                    {STEP_LABELS[ev.step] || ev.step}:{' '}
                  </span>
                  <span className="text-[#475569]">{ev.message}</span>
                </div>
              </li>
            );
          })}
        </ol>

        {isRunning && (
          <div className="space-y-2.5 rounded-xl bg-[#F6F8FB] p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        )}

        {resultTransaction && finalDecision && (
          <>
            <Separator />
            <div
              className={`space-y-3 rounded-xl p-4 ${
                finalDecision === 'recorded' ? 'bg-emerald-50/70' : 'bg-red-50/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#475569]">
                    <span>{resultTransaction.date}</span>
                    <span>•</span>
                    <span>
                      {resultTransaction.type === 'revenue' ? 'Khoản Thu vào' : 'Khoản Chi ra'}
                    </span>
                  </div>
                  <p className="mt-1 text-base font-bold text-[#111625]">
                    {resultTransaction.counterparty || 'Giao dịch mới'}
                  </p>
                  <p className="tabular-nums text-xl font-extrabold text-[#2E2396]">
                    {formatVnd(resultTransaction.amount_vnd)}
                  </p>
                </div>

                {finalDecision === 'recorded' ? (
                  <Stamp animate />
                ) : (
                  <Badge variant="destructive" className="px-3 py-1 font-bold">
                    <AppIcon name="help" className="text-sm" />
                    CẦN XÁC NHẬN LẠI
                  </Badge>
                )}
              </div>

              {resultTransaction.clarification_question && (
                <div className="rounded-xl bg-[#FEF08A]/55 p-3.5 text-sm text-[#111625]">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <p className="inline-flex items-start gap-2 font-medium leading-relaxed">
                      <AppIcon name="chat" className="mt-0.5 shrink-0 text-base text-[#2E2396]" />
                      <span>
                        <strong>Keiki hỏi:</strong> {resultTransaction.clarification_question}
                      </span>
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => speakVietnamese(resultTransaction.clarification_question || '')}
                      className="shrink-0"
                    >
                      <AppIcon name="volume_up" className="text-base" />
                      Nghe đọc
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {finalDecision === 'needs_review' ? (
                  <Button
                    type="button"
                    variant="destructive-solid"
                    size="lg"
                    onClick={onOpenReviewTab}
                  >
                    <AppIcon name="fact_check" className="text-lg" />
                    Mở mục Cần hỏi lại để xử lý ngay
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="emerald"
                    size="lg"
                    onClick={onOpenLedgerTab}
                  >
                    <AppIcon name="menu_book" className="text-lg" />
                    Xem trong Sổ kế toán
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
