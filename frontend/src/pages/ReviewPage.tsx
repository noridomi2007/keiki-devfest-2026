import { useState } from 'react';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { api } from '../api/endpoints';
import { vi } from '../i18n/vi';
import type { Transaction } from '../types/contract';
import { formatDateVi, formatVnd } from '../utils/money';
import { speakVietnamese } from '../utils/speech';
import { AppIcon } from '@/components/AppIcon';

interface ReviewPageProps {
  allTransactions: Transaction[];
  onUpdated: () => void;
}

export function ReviewPage({ allTransactions, onUpdated }: ReviewPageProps) {
  const reviewItems = allTransactions.filter((t) => t.status === 'needs_review');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editCounterparty, setEditCounterparty] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brokenImgIds, setBrokenImgIds] = useState<Record<string, boolean>>({});
  const [reviewError, setReviewError] = useState<string | null>(null);

  const handleConfirm = async (tx: Transaction, mergeIntoDuplicate: boolean) => {
    setBusyId(tx.id);
    setReviewError(null);
    try {
      await api.confirmTransaction(tx.id, mergeIntoDuplicate);
      onUpdated();
    } catch (err) {
      setReviewError((err as Error).message || 'Không thể xác nhận chứng từ này.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (txId: string) => {
    setBusyId(txId);
    setReviewError(null);
    try {
      await api.rejectTransaction(txId, 'Chủ hộ bỏ qua chứng từ trùng/sai');
      onUpdated();
    } catch (err) {
      setReviewError((err as Error).message || 'Không thể bỏ qua chứng từ này.');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditAmount(String(tx.amount_vnd));
    setEditCounterparty(tx.counterparty || '');
  };

  const saveEditAndConfirm = async (txId: string) => {
    setBusyId(txId);
    setReviewError(null);
    try {
      const amt = parseInt(editAmount.replace(/[^\d]/g, ''), 10);
      await api.patchTransaction(txId, {
        amount_vnd: amt > 0 ? amt : undefined,
        counterparty: editCounterparty.trim() || undefined,
      });
      await api.confirmTransaction(txId, false);
      setEditingId(null);
      onUpdated();
    } catch (err) {
      setReviewError((err as Error).message || 'Không thể lưu chỉnh sửa.');
    } finally {
      setBusyId(null);
    }
  };

  if (reviewItems.length === 0) {
    return (
      <Card className="p-10 text-center">
        <AppIcon name="task_alt" className="mx-auto text-5xl text-[#0B6E54]" />
        <h3 className="font-heading mt-3 text-xl font-bold text-[#111625]">
          Tất cả chứng từ đã được kiểm tra rõ ràng
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-[#475569]">
          Hiện không có hóa đơn hay chuyển khoản nào nghi trùng hoặc bất thường cần hỏi lại cô/chú.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {reviewError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-[#B91C1C]">
          {reviewError}
        </div>
      )}

      <Card className="border-[#B91C1C]/25 bg-gradient-to-r from-[#FFF8F8] via-white to-[#FFF8F8] p-4 shadow-xs sm:p-5">
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-[#B91C1C]">
            <AppIcon name="notification_important" className="text-xl" />
            <span className="audit-live-dot -top-1 -right-1 absolute h-2.5 w-2.5 rounded-full bg-[#B91C1C]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold text-[#111625]">
              Keiki cần hỏi lại cô/chú ({reviewItems.length} chứng từ)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#475569]">
              Nguyên tắc an toàn: Khi nghi ngờ trùng chéo hóa đơn – chuyển khoản hoặc giá tăng đột
              biến, Keiki luôn hỏi ý kiến cô/chú trước khi ghi sổ.
            </p>
          </div>
        </div>
      </Card>

      {reviewItems.map((tx, index) => {
        const isCrossDup = tx.warnings.some((w) => w.code === 'CROSS_DUPLICATE');
        const origTx = tx.duplicate_of_id
          ? allTransactions.find((x) => x.id === tx.duplicate_of_id)
          : null;

        return (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.36, delay: Math.min(index * 0.08, 0.32), ease: [0.16, 1, 0.3, 1] }}
          >
          <Card className="card-interactive gap-0 overflow-hidden border-[#B91C1C]/45 py-0 shadow-sm">
            {/* Proactive Question Header with Read-Aloud Button */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-[#FEF08A]/55 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-base font-bold leading-snug text-[#111625]">
                  "{tx.clarification_question || tx.warnings[0]?.message}"
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="destructive" className="font-mono text-xs">
                    Chứng từ #{index + 1} / {reviewItems.length}
                  </Badge>
                  <span className="text-xs font-medium text-[#475569]">
                    Câu hỏi xác minh tự động từ Keiki
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  speakVietnamese(tx.clarification_question || tx.warnings[0]?.message || '')
                }
                className="h-9 shrink-0 font-bold"
              >
                <AppIcon name="volume_up" className="text-lg" />
                {vi.actions.speakAloud}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-12">
              {/* Left: Original Document Image Preview */}
              <div className="min-w-0 lg:col-span-5">
                {tx.document_id ? (
                  <div className="overflow-hidden rounded-xl bg-[#F6F8FB] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#475569]">
                      <span className="font-mono">{tx.document_id}</span>
                      <Badge variant="outline" className="text-[#2E2396]">
                        {tx.payment_method === 'transfer' ? 'Ảnh chuyển khoản' : 'Ảnh hóa đơn giấy'}
                      </Badge>
                    </div>
                    {brokenImgIds[tx.id] ? (
                      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-white px-4 py-8 text-center">
                        <AppIcon name="receipt_long" className="text-3xl text-[#2E2396]" />
                        <p className="text-xs font-bold text-[#111625]">
                          Bản ghi chứng từ dữ liệu mẫu
                        </p>
                        <p className="text-xs text-[#475569]">
                          Số tiền đối soát: {formatVnd(tx.amount_vnd)} • {formatDateVi(tx.date)}
                        </p>
                      </div>
                    ) : (
                      <img
                        src={`/api/documents/${tx.document_id}/file`}
                        alt="Chứng từ cần duyệt"
                        onError={() =>
                          setBrokenImgIds((prev) => ({ ...prev, [tx.id]: true }))
                        }
                        className="mx-auto max-h-72 w-auto rounded-lg object-contain"
                      />
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl bg-[#F6F8FB] p-6 text-center text-sm text-[#475569]">
                    Chứng từ ghi âm / văn bản
                  </div>
                )}
              </div>

              {/* Right: Extracted Fields, Warnings & Action Buttons */}
              <div className="flex min-w-0 flex-col justify-between space-y-4 lg:col-span-7">
                <div className="space-y-3">
                  {/* Warning Bands */}
                  <div className="space-y-1.5">
                    {tx.warnings.map((w, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 rounded-xl bg-red-50/90 px-3.5 py-2.5 text-xs font-semibold text-[#B91C1C]"
                      >
                        <AppIcon name="warning" className="mt-0.5 shrink-0 text-base" />
                        <span>
                          <strong className="font-mono">[{w.code}]</strong> {w.message}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Side-by-Side Comparison when CROSS_DUPLICATE is detected */}
                  {isCrossDup && origTx && (
                    <div className="rounded-xl bg-[#E8ECF6]/75 p-3.5 text-xs">
                      <div className="inline-flex items-center gap-1.5 font-bold text-[#2E2396]">
                        <AppIcon name="link" className="text-base" />
                        Đối chiếu với Hóa đơn gốc đã ghi sổ trước đó (Mã #{origTx.id}):
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1.5 text-[#111625] sm:grid-cols-2">
                        <div>
                          • Đối tác: <strong>{origTx.counterparty}</strong>
                        </div>
                        <div className="tabular-nums">
                          • Số tiền: <strong>{formatVnd(origTx.amount_vnd)}</strong>
                        </div>
                        <div>• Ngày hóa đơn: {formatDateVi(origTx.date)}</div>
                        <div className="font-mono">
                          • Chứng từ hiện có: {origTx.linked_document_ids.join(', ')}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Extracted Fields */}
                  {editingId === tx.id ? (
                    <div className="space-y-3 rounded-xl bg-[#F6F8FB] p-4">
                      <div>
                        <label className="block text-xs font-bold text-[#111625]">
                          Sửa tên đối tác / diễn giải:
                        </label>
                        <Input
                          type="text"
                          value={editCounterparty}
                          onChange={(e) => setEditCounterparty(e.target.value)}
                          className="mt-1 bg-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#111625]">
                          Sửa tổng số tiền (VND):
                        </label>
                        <Input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="mt-1 bg-white font-mono text-base font-bold text-[#2E2396]"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="emerald"
                          size="sm"
                          onClick={() => saveEditAndConfirm(tx.id)}
                        >
                          Lưu sửa đổi &amp; Ghi vào sổ
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(null)}
                        >
                          Hủy
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 rounded-xl bg-[#F6F8FB] p-4 text-sm sm:grid-cols-2">
                      <div>
                        <span className="text-xs text-[#475569]">Đối tác / Cửa hàng:</span>
                        <div
                          className={`mt-0.5 font-bold text-[#111625] ${
                            (tx.confidence?.counterparty ?? 1) < 0.85
                              ? 'inline-block rounded bg-[#FEF08A] px-1.5 py-0.5'
                              : ''
                          }`}
                        >
                          {tx.counterparty || 'Chưa rõ'}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[#475569]">Tổng số tiền đọc được:</span>
                        <div>
                          <span className="mt-0.5 inline-block rounded bg-[#FEF08A]/75 px-2 py-0.5 font-mono text-base font-extrabold text-[#B91C1C] tabular-nums">
                            {formatVnd(tx.amount_vnd)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[#475569]">Ngày chứng từ:</span>
                        <div className="mt-0.5 font-mono font-semibold text-[#111625]">
                          {formatDateVi(tx.date)}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[#475569]">Phân loại sổ TT 152:</span>
                        <div className="mt-0.5 text-xs font-semibold text-[#111625]">
                          {vi.taxGroupLabels[tx.tax_group]}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2.5">
                  {isCrossDup && tx.duplicate_of_id && (
                    <Button
                      type="button"
                      size="lg"
                      disabled={busyId === tx.id}
                      onClick={() => handleConfirm(tx, true)}
                      className="h-11 flex-1 font-bold"
                    >
                      <AppIcon name="merge" className="text-xl" />
                      {vi.actions.mergeDuplicate}
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="emerald"
                    size="lg"
                    disabled={busyId === tx.id}
                    onClick={() => handleConfirm(tx, false)}
                    className="h-11 font-bold"
                  >
                    <AppIcon name="check_circle" className="text-lg" />
                    {isCrossDup ? 'Ghi thành giao dịch riêng' : vi.actions.confirmRecord}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={busyId === tx.id}
                    onClick={() => startEdit(tx)}
                    className="h-11 text-xs font-bold"
                  >
                    <AppIcon name="edit" className="text-base" />
                    {vi.actions.editTransaction}
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    size="lg"
                    disabled={busyId === tx.id}
                    onClick={() => handleReject(tx.id)}
                    className="h-11 text-xs font-bold"
                  >
                    <AppIcon name="delete_forever" className="text-base" />
                    {vi.actions.rejectTransaction}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
