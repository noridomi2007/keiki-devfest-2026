import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '../api/endpoints';
import { OdometerNumber } from '../components/OdometerNumber';
import { Stamp } from '../components/Stamp';
import { vi } from '../i18n/vi';
import type { Transaction } from '../types/contract';
import { formatDateVi, formatVnd } from '../utils/money';
import { AppIcon } from '@/components/AppIcon';

interface LedgerPageProps {
  transactions: Transaction[];
  onRefresh: () => void;
  onSelectReviewItem: () => void;
}

export function LedgerPage({
  transactions,
  onRefresh,
  onSelectReviewItem,
}: LedgerPageProps) {
  const [filterType, setFilterType] = useState<'all' | 'revenue' | 'expense'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [brokenDocIds, setBrokenDocIds] = useState<Record<string, boolean>>({});
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [txActionError, setTxActionError] = useState<string | null>(null);

  // Manual entry form state
  const [manualDate, setManualDate] = useState('2026-11-12');
  const [manualType, setManualType] = useState<'revenue' | 'expense'>('revenue');
  const [manualAmount, setManualAmount] = useState('500000');
  const [manualCounterparty, setManualCounterparty] = useState('');
  const [manualPayment, setManualPayment] = useState<'cash' | 'transfer'>('cash');

  const filtered = transactions.filter((t) => {
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const cp = (t.counterparty || '').toLowerCase();
      const tr = (t.transcript || '').toLowerCase();
      const itemsStr = t.items.map((i) => i.name.toLowerCase()).join(' ');
      if (!cp.includes(q) && !tr.includes(q) && !itemsStr.includes(q)) return false;
    }
    return true;
  });

  const totalRev = filtered
    .filter((t) => t.type === 'revenue' && t.status === 'recorded')
    .reduce((acc, t) => acc + t.amount_vnd, 0);
  const totalExp = filtered
    .filter((t) => t.type === 'expense' && t.status === 'recorded')
    .reduce((acc, t) => acc + t.amount_vnd, 0);

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    const amt = parseInt(manualAmount.replace(/[^\d]/g, ''), 10);
    if (!amt || amt <= 0) return;
    try {
      await api.createManualTransaction({
        date: manualDate,
        type: manualType,
        payment_method: manualPayment,
        amount_vnd: amt,
        counterparty:
          manualCounterparty.trim() ||
          (manualType === 'revenue' ? 'Bán hàng tại quán' : 'Chi mua hàng hóa'),
      });
      setShowManualModal(false);
      setManualCounterparty('');
      onRefresh();
    } catch (err) {
      setManualError((err as Error).message || 'Không thể ghi sổ bút toán.');
    }
  };

  const handleSoftDeleteTx = async (txId: string) => {
    setTxActionError(null);
    try {
      await api.deleteTransaction(txId);
      setSelectedTx(null);
      onRefresh();
    } catch (err) {
      setTxActionError((err as Error).message || 'Không thể hủy bút toán này.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Summary Ribbon */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="card-interactive relative gap-1 overflow-hidden p-4">
          <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-[#0B6E54] to-emerald-400" />
          <div className="text-xs font-semibold text-[#475569]">Tổng Thu đã ghi sổ</div>
          <div className="font-heading text-lg font-extrabold text-[#0B6E54] tabular-nums">
            <OdometerNumber value={`+${formatVnd(totalRev)}`} />
          </div>
        </Card>
        <Card className="card-interactive relative gap-1 overflow-hidden p-4">
          <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-[#B91C1C] to-rose-400" />
          <div className="text-xs font-semibold text-[#475569]">Tổng Chi đã ghi sổ</div>
          <div className="font-heading text-lg font-extrabold text-[#B91C1C] tabular-nums">
            <OdometerNumber value={`-${formatVnd(totalExp)}`} />
          </div>
        </Card>
        <Card className="card-interactive relative flex flex-row flex-wrap items-center justify-between gap-2.5 overflow-hidden p-4">
          <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-[#2E2396] to-indigo-400" />
          <div className="min-w-0">
            <div className="whitespace-nowrap text-xs font-semibold text-[#475569]">
              Chênh lệch Thu - Chi
            </div>
            <div className="font-heading text-lg font-extrabold text-[#2E2396] tabular-nums">
              <OdometerNumber value={formatVnd(totalRev - totalExp)} />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setShowManualModal(true)}
            className="btn-shimmer h-9 shrink-0 text-xs font-bold shadow-xs"
          >
            <AppIcon name="edit_note" className="text-base" />
            {vi.actions.manualEntry}
          </Button>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="flex flex-row flex-wrap items-center justify-between gap-2.5 p-3">
        <Tabs
          value={filterType}
          onValueChange={(val) => setFilterType(val as 'all' | 'revenue' | 'expense')}
        >
          <TabsList className="h-9 bg-[#F6F8FB] p-1">
            <TabsTrigger value="all" className="cursor-pointer px-3 text-xs font-bold">
              Tất cả
            </TabsTrigger>
            <TabsTrigger value="revenue" className="cursor-pointer px-3 text-xs font-bold">
              Khoản Thu (+)
            </TabsTrigger>
            <TabsTrigger value="expense" className="cursor-pointer px-3 text-xs font-bold">
              Khoản Chi (-)
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-[200px] flex-1">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên mặt hàng, đại lý, câu ghi âm..."
            className="h-9 text-xs"
          />
        </div>
      </Card>

      {/* Vietnamese Lined Notebook ("Vở Ô Ly") Ledger */}
      <Card className="notebook-paper gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[#FFF9DB]/55 px-4 py-3">
          <div className="flex items-center gap-2">
            <AppIcon name="menu_book" className="text-[#2E2396]" />
            <h3 className="font-heading font-bold text-[#111625]">
              Sổ Ghi Chép Thu Chi Hộ Kinh Doanh (TT 152/2025/TT-BTC)
            </h3>
          </div>
          <Badge variant="outline" className="font-mono text-xs text-[#475569]">
            {filtered.length} dòng bút toán
          </Badge>
        </div>

        <div className="divide-y divide-border">
          {filtered.map((tx, idx) => {
            const isNeedsReview = tx.status === 'needs_review';
            const hasMergedDocs = tx.linked_document_ids && tx.linked_document_ids.length >= 2;
            const docCount = tx.linked_document_ids?.length || (tx.document_id ? 1 : 0);

            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(idx * 0.035, 0.28), ease: [0.16, 1, 0.3, 1] }}
                onClick={() => {
                  if (isNeedsReview) {
                    onSelectReviewItem();
                  } else {
                    setSelectedTx(tx);
                  }
                }}
                className="group relative flex cursor-pointer flex-col gap-2.5 border-l-[3px] border-l-transparent px-4 py-3.5 transition-all hover:border-l-[#2E2396] hover:bg-[#2E2396]/[0.045] sm:flex-row sm:items-start sm:gap-3"
              >
                {/* 1px Hairline Date Margin */}
                <div className="flex items-center gap-2 sm:block sm:w-16 sm:shrink-0 sm:border-r sm:border-border sm:pr-2 sm:text-center">
                  <div className="font-mono text-xs font-bold text-[#111625] tabular-nums">
                    {formatDateVi(tx.date).slice(0, 5)}
                  </div>
                  <div className="font-mono text-xs text-[#475569]">
                    {tx.date.slice(0, 4)}
                  </div>
                  <div className="sm:mt-1">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${
                        tx.payment_method === 'transfer'
                          ? 'bg-sky-100 text-sky-900'
                          : 'bg-slate-200/80 text-[#111625]'
                      }`}
                    >
                      {tx.payment_method === 'transfer' ? 'CK/QR' : 'Tiền mặt'}
                    </span>
                  </div>
                </div>

                {/* Main Entry Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-bold text-[#111625] ${
                        isNeedsReview ? 'red-wavy-underline text-[#B91C1C]' : ''
                      }`}
                    >
                      {tx.counterparty || 'Giao dịch hộ kinh doanh'}
                    </span>

                    {hasMergedDocs && (
                      <Badge variant="secondary" className="text-xs text-[#2E2396]">
                        <AppIcon name="link" className="text-xs" />
                        {vi.mergedBadge}
                      </Badge>
                    )}

                    {!hasMergedDocs && docCount === 1 && (
                      <Badge variant="outline" className="text-xs text-[#475569]">
                        <AppIcon name="image" className="text-xs" />
                        Có ảnh gốc
                      </Badge>
                    )}
                  </div>

                  {tx.transcript && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs italic text-[#2E2396]">
                      <AppIcon name="graphic_eq" className="text-sm" />
                      Giọng nói: "{tx.transcript}"
                    </p>
                  )}

                  {tx.items && tx.items.length > 0 && (
                    <p className="mt-0.5 text-xs text-[#475569] sm:truncate">
                      {tx.items
                        .map((i) => `${i.name} (SL: ${i.quantity} × ${formatVnd(i.unit_price_vnd)})`)
                        .join(' • ')}
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-[#475569]">
                      {vi.taxGroupLabels[tx.tax_group] || tx.tax_group}
                    </span>

                    {isNeedsReview && tx.warnings.length > 0 && (
                      <Badge variant="amber" className="font-bold">
                        <AppIcon name="warning" className="text-xs" />
                        {tx.warnings[0].code}: Bấm để xác nhận
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Amount & Stamp */}
                <div className="flex items-center justify-between border-t border-border/60 pt-2.5 sm:block sm:shrink-0 sm:border-0 sm:pt-0 sm:text-right">
                  <div
                    className={`font-mono text-base font-extrabold tabular-nums sm:text-lg ${
                      tx.type === 'revenue' ? 'text-[#0B6E54]' : 'text-[#111625]'
                    }`}
                  >
                    {tx.type === 'revenue' ? '+' : '-'}
                    {formatVnd(tx.amount_vnd)}
                  </div>
                  <div className="sm:mt-1.5">
                    {tx.status === 'recorded' ? (
                      <Stamp animate={false} />
                    ) : (
                      <Badge variant="destructive" className="font-bold">
                        Cần hỏi lại
                      </Badge>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </Card>

      {/* Transaction Detail & Evidence Modal */}
      <Dialog open={Boolean(selectedTx)} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-2xl">
          {selectedTx && (
            <>
              <DialogHeader className="border-b border-border pb-3">
                <DialogTitle className="text-lg font-bold text-[#111625]">
                  {selectedTx.counterparty || 'Giao dịch'}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs text-[#475569]">
                  Chi tiết bút toán #{selectedTx.id} • Ngày {formatDateVi(selectedTx.date)}
                </DialogDescription>
              </DialogHeader>

              {txActionError && (
                <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-[#B91C1C]">
                  {txActionError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 rounded-xl bg-[#F6F8FB] p-4 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-xs text-[#475569]">Số tiền ghi sổ:</span>
                  <div className="font-mono text-lg font-extrabold text-[#2E2396] tabular-nums">
                    {formatVnd(selectedTx.amount_vnd)}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-[#475569]">Nhóm ngành Thông tư 152:</span>
                  <div className="font-semibold text-[#111625]">
                    {vi.taxGroupLabels[selectedTx.tax_group]}
                  </div>
                </div>
              </div>

              {(selectedTx.linked_document_ids?.length > 0 || selectedTx.document_id) && (
                <div className="space-y-2.5">
                  <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-[#475569]">
                    <AppIcon name="attach_file" className="text-sm text-[#2E2396]" />
                    Chứng từ gốc lưu trữ đối chiếu ({selectedTx.linked_document_ids.length || 1}{' '}
                    chứng từ)
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(selectedTx.linked_document_ids.length > 0
                      ? selectedTx.linked_document_ids
                      : [selectedTx.document_id!]
                    ).map((docId, idx) => (
                      <div key={docId} className="overflow-hidden rounded-xl bg-[#F6F8FB] p-2.5">
                        <div className="mb-1.5 font-mono text-xs font-bold text-[#2E2396]">
                          Chứng từ #{idx + 1} ({docId})
                        </div>
                        {brokenDocIds[docId] ? (
                          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-white px-4 py-8 text-center">
                            <AppIcon name="receipt_long" className="text-3xl text-[#2E2396]" />
                            <p className="text-xs font-bold text-[#111625]">
                              Không hiển thị được ảnh chứng từ gốc
                            </p>
                            <p className="text-xs text-[#475569]">
                              Mã chứng từ: {docId} • {formatVnd(selectedTx.amount_vnd)}
                            </p>
                          </div>
                        ) : (
                          <img
                            src={`/api/documents/${docId}/file`}
                            alt={`Chứng từ ${docId}`}
                            onError={() =>
                              setBrokenDocIds((prev) => ({ ...prev, [docId]: true }))
                            }
                            className="mx-auto max-h-72 w-auto rounded-lg object-contain"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#111625]">
                  <AppIcon name="fact_check" className="text-sm text-[#2E2396]" />
                  <span>Nhật ký kiểm toán (Audit Trail)</span>
                </div>
                {selectedTx.audit_log && selectedTx.audit_log.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedTx.audit_log.map((entry, idx) => (
                      <div
                        key={`${entry.timestamp}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#F6F8FB] px-3 py-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-[#111625]">{entry.summary}</span>
                          <span className="ml-2 text-[#475569]">• {entry.actor}</span>
                        </div>
                        <span className="font-mono text-[11px] text-[#475569] tabular-nums">
                          {entry.action} · {entry.timestamp.slice(0, 16).replace('T', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#475569]">Chưa có thay đổi nào sau khi ghi sổ.</p>
                )}
              </div>

              <DialogFooter className="border-t border-border pt-3">
                {selectedTx.status !== 'rejected' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSoftDeleteTx(selectedTx.id)}
                    className="border-red-200 text-xs font-bold text-[#B91C1C] hover:bg-red-50"
                  >
                    <AppIcon name="delete_forever" className="text-sm" />
                    Xóa mềm (giữ vết kiểm toán)
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setTxActionError(null);
                    setSelectedTx(null);
                  }}
                >
                  Đóng
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual Entry Modal */}
      <Dialog open={showManualModal} onOpenChange={setShowManualModal}>
        <DialogContent className="p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border bg-[#F6F8FB] px-5 py-4">
            <DialogTitle className="text-lg font-bold text-[#111625]">
              Ghi tay giao dịch vào sổ
            </DialogTitle>
            <DialogDescription className="text-xs text-[#475569]">
              Bổ sung giao dịch tiền mặt hoặc chuyển khoản phát sinh trực tiếp.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateManual} className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#111625]">Loại giao dịch</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as 'revenue' | 'expense')}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-[#F6F8FB] px-3 text-sm font-semibold text-[#111625]"
                >
                  <option value="revenue">Thu vào (Doanh thu)</option>
                  <option value="expense">Chi ra (Chi phí)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#111625]">Ngày ghi sổ</label>
                <Input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="mt-1 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111625]">Số tiền (VND)</label>
              <Input
                type="number"
                required
                min={1000}
                step={1000}
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                className="mt-1 font-mono text-base font-bold text-[#2E2396]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111625]">
                Đối tác / Nội dung diễn giải
              </label>
              <Input
                type="text"
                value={manualCounterparty}
                onChange={(e) => setManualCounterparty(e.target.value)}
                placeholder="Ví dụ: Bán 15 tô mì Quảng buổi trưa..."
                className="mt-1"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111625]">
                Hình thức thanh toán
              </label>
              <select
                value={manualPayment}
                onChange={(e) => setManualPayment(e.target.value as 'cash' | 'transfer')}
                className="mt-1 h-10 w-full rounded-xl border border-border bg-[#F6F8FB] px-3 text-sm text-[#111625]"
              >
                <option value="cash">Tiền mặt</option>
                <option value="transfer">Chuyển khoản / VietQR</option>
              </select>
            </div>

            {manualError && (
              <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-[#B91C1C]">
                {manualError}
              </div>
            )}

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowManualModal(false)}
              >
                Hủy
              </Button>
              <Button type="submit" size="sm">
                Lưu &amp; Đóng dấu ghi sổ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
