import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '../api/endpoints';
import { AgentTimeline } from '../components/AgentTimeline';
import { useJobStream } from '../hooks/useJobStream';
import { vi } from '../i18n/vi';
import type { DocumentKind, Transaction } from '../types/contract';
import { AppIcon } from '@/components/AppIcon';

interface AddPageProps {
  onTransactionCreated: (tx?: Transaction) => void;
  onOpenReviewTab: () => void;
  onOpenLedgerTab: () => void;
}

const VOICE_SUGGESTIONS = [
  'Hôm nay xuất bán 20 đơn hàng bán lẻ tổng cộng 800 nghìn đồng, khách trả tiền mặt.',
  'Thu tiền hợp đồng dịch vụ thiết kế và in ấn của khách hàng 4 triệu 200 nghìn qua chuyển khoản.',
  'Nhập 2 thùng nguyên vật liệu từ nhà cung cấp hết 540 nghìn tiền mặt.',
  'Thanh toán tiền điện nước và internet cơ sở kinh doanh tháng này 1 triệu 250 nghìn.',
];

export function AddPage({
  onTransactionCreated,
  onOpenReviewTab,
  onOpenLedgerTab,
}: AddPageProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [voiceBoxOpen, setVoiceBoxOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [spokenText, setSpokenText] = useState(VOICE_SUGGESTIONS[0]);

  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const receiptGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const transferInputRef = useRef<HTMLInputElement | null>(null);
  const mobileAudioInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const { events, isRunning, finalDecision, resultTransaction } = useJobStream(
    activeJobId,
    (tx) => {
      onTransactionCreated(tx);
    }
  );

  const handleFileUpload = useCallback(
    async (file: File | Blob, kind: DocumentKind, filename?: string) => {
      setErrorMsg(null);
      setInfoMsg(null);
      setIsUploading(true);
      try {
        const res = await api.uploadDocument(file, kind, filename);
        setActiveJobId(res.job_id);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Không thể tải tệp lên.');
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  // Listen for Ctrl+V clipboard image paste anywhere on AddPage
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (isUploading || isRunning) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            await handleFileUpload(blob, 'transfer', 'clipboard_transfer.png');
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFileUpload, isUploading, isRunning]);

  const handleClipboardButton = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    if (navigator.clipboard && 'read' in navigator.clipboard) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            await handleFileUpload(blob, 'transfer', 'clipboard_vietqr.png');
            return;
          }
        }
        setInfoMsg(
          'Không thấy ảnh trong Clipboard. Keiki đã mở thư viện ảnh để cô/chú chọn ảnh VietQR trực tiếp.',
        );
      } catch {
        setInfoMsg(
          'Trình duyệt (đặc biệt Safari iOS) có thể chặn đọc Clipboard tự động — cô/chú chọn trực tiếp ảnh chuyển khoản VietQR vừa chụp từ Album nhé.',
        );
      }
    } else {
      setInfoMsg(
        'Trình duyệt chưa hỗ trợ dán ảnh trực tiếp — Keiki đã mở sẵn hộp chọn ảnh VietQR từ Album.',
      );
    }
    transferInputRef.current?.click();
  };

  const startOrStopMic = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceBoxOpen(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size > 100) {
          await handleFileUpload(blob, 'audio', 'ghi_am_giao_dich.webm');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setVoiceBoxOpen(true);
    } catch {
      setVoiceBoxOpen(true);
    }
  };

  const handleSubmitVoiceText = async (transcript: string) => {
    setErrorMsg(null);
    setInfoMsg(null);
    setIsUploading(true);
    try {
      const res = await api.submitVoiceText(transcript);
      setActiveJobId(res.job_id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể gửi câu nói.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="gap-0 py-0">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-heading text-xl font-bold tracking-tight text-[#111625]">
                Ghi sổ tự nhiên cùng Trợ lý AI Keiki
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#475569] sm:text-sm">
                Dành cho mọi Doanh nghiệp Vừa &amp; Nhỏ (SME) và Hộ kinh doanh tại Việt Nam
              </p>
            </div>
          </div>

          {/* 3 Big Primary Action Buttons */}
          <div className="grid grid-cols-1 gap-3.5">
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f, 'image');
                e.target.value = '';
              }}
            />
            <input
              ref={receiptGalleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f, 'image');
                e.target.value = '';
              }}
            />
            <input
              ref={mobileAudioInputRef}
              type="file"
              accept="audio/*"
              capture
              className="hidden"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f, 'audio', f.name || 'ghi_am_dien_thoai.m4a');
                e.target.value = '';
              }}
            />

            <div className="space-y-1.5">
              <button
                type="button"
                disabled={isUploading || isRunning}
                onClick={() => receiptInputRef.current?.click()}
                className="btn-shimmer group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-[#2E2396] via-[#3A2EB5] to-[#2E2396] p-4 text-left text-white shadow-md shadow-[#2E2396]/25 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#2E2396]/35 disabled:opacity-60"
              >
                {(isUploading || isRunning) && <div aria-hidden="true" className="scan-beam" />}
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3">
                  <AppIcon name="photo_camera" className="text-3xl" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold sm:text-lg">{vi.actions.captureReceipt}</div>
                  <div className="text-xs text-indigo-100">{vi.actions.captureReceiptSub}</div>
                </div>
                <AppIcon name="chevron_right" className="text-2xl transition-transform group-hover:translate-x-1" />
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2 px-1">
                <button
                  type="button"
                  disabled={isUploading || isRunning}
                  onClick={() => receiptInputRef.current?.click()}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-[#2E2396] hover:underline"
                >
                  <AppIcon name="photo_camera" className="text-sm" />
                  Mở Camera sau ĐT
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  disabled={isUploading || isRunning}
                  onClick={() => receiptGalleryInputRef.current?.click()}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-[#0B6E54] hover:underline"
                >
                  <AppIcon name="photo_library" className="text-sm" />
                  Chọn ảnh hóa đơn từ Album ĐT
                </button>
              </div>
            </div>

            {/* 2. Paste Bank Transfer Screenshot */}
            <input
              ref={transferInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f, 'transfer');
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={isUploading || isRunning}
              onClick={handleClipboardButton}
              className="card-interactive group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#0B6E54]/35 bg-gradient-to-r from-emerald-50/85 to-white p-4 text-left text-[#111625] transition hover:border-[#0B6E54]/60 disabled:opacity-60"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0B6E54] text-white shadow-xs transition-transform duration-300 group-hover:scale-105">
                <AppIcon name="content_paste_go" className="text-3xl" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-[#0B6E54] sm:text-lg">
                  {vi.actions.pasteTransfer}
                </div>
                <div className="text-xs text-[#475569]">{vi.actions.pasteTransferSub}</div>
              </div>
              <AppIcon name="chevron_right" className="text-2xl text-[#0B6E54] transition-transform group-hover:translate-x-1" />
            </button>

            {/* 3. Speak Voice Input */}
            <button
              type="button"
              disabled={isUploading || isRunning}
              onClick={() => setVoiceBoxOpen((v) => !v)}
              className={`card-interactive group flex cursor-pointer items-center gap-4 rounded-2xl border p-4 text-left transition ${
                isRecording
                  ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C] shadow-md shadow-red-900/10'
                  : 'border-border bg-[#F6F8FB] text-[#111625] hover:border-[#2E2396]'
              }`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-300 group-hover:scale-105 ${
                  isRecording ? 'animate-pulse bg-[#B91C1C]' : 'bg-[#2E2396]'
                }`}
              >
                {isRecording ? (
                  <span className="flex h-5 items-end gap-1" aria-hidden="true">
                    <span className="voice-bar h-5 w-1 rounded-full bg-white" />
                    <span className="voice-bar h-5 w-1 rounded-full bg-white [animation-delay:0.2s]" />
                    <span className="voice-bar h-5 w-1 rounded-full bg-white [animation-delay:0.4s]" />
                  </span>
                ) : (
                  <AppIcon name="mic" className="text-3xl" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold sm:text-lg">
                  {isRecording ? vi.actions.stopRecording : vi.actions.speakVoice}
                </div>
                <div className="text-xs text-[#475569]">{vi.actions.speakVoiceSub}</div>
              </div>
              <AppIcon name={voiceBoxOpen ? 'expand_less' : 'expand_more'} className="text-2xl text-[#2E2396]" />
            </button>
          </div>

          {/* Voice Input Panel */}
          <AnimatePresence>
            {voiceBoxOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-xl border border-[#2E2396]/15 bg-[#F6F8FB] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#2E2396]">
                  <AppIcon name="mic" className="text-base" />
                  Ghi âm giọng nói hoặc nhập câu lệnh tiếng Việt:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={isRecording ? 'destructive-solid' : 'default'}
                    onClick={startOrStopMic}
                  >
                    <AppIcon name={isRecording ? 'stop_circle' : 'mic'} className="text-base" />
                    {isRecording ? 'Đang thu âm... Bấm dừng' : 'Bật Micro'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => mobileAudioInputRef.current?.click()}
                    className="text-[#2E2396]"
                  >
                    <AppIcon name="smartphone" className="text-base" />
                    Tải file âm thanh ĐT
                  </Button>
                </div>
              </div>

              <textarea
                rows={2}
                value={spokenText}
                onChange={(e) => setSpokenText(e.target.value)}
                className="mt-2.5 w-full rounded-xl border border-border bg-white p-3 text-sm font-medium text-[#111625] focus:border-[#2E2396] focus:outline-none"
                placeholder="Ví dụ: Hôm nay xuất bán 20 đơn hàng tổng cộng 3 triệu 500 nghìn..."
              />

              <div className="mt-2 flex flex-wrap gap-1.5">
                {VOICE_SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSpokenText(s)}
                    className="cursor-pointer rounded-lg border border-border bg-white px-2.5 py-1 text-xs text-[#475569] hover:border-[#2E2396] hover:text-[#2E2396]"
                  >
                    Mẫu {idx + 1}: "{s.slice(0, 42)}..."
                  </button>
                ))}
              </div>

              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  disabled={isUploading || isRunning || !spokenText.trim()}
                  onClick={() => handleSubmitVoiceText(spokenText.trim())}
                  size="lg"
                >
                  <AppIcon name="send" className="text-lg" />
                  Gửi câu nói cho Keiki ghi sổ
                </Button>
              </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {infoMsg && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#2E2396]/25 bg-indigo-50/70 p-3 text-xs font-medium text-[#2E2396]">
              <AppIcon name="help" className="mt-0.5 shrink-0 text-base" />
              <span>{infoMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#B91C1C]/35 bg-red-50 p-3 text-sm font-medium text-[#B91C1C]">
              <AppIcon name="warning" className="shrink-0 text-lg" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#F6F8FB] p-3 text-xs text-[#475569]">
            <AppIcon name="shield" className="mt-0.5 shrink-0 text-sm text-[#0B6E54]" />
            <span>
              <strong className="text-[#111625]">Minh bạch xử lý AI:</strong> Khi cô/chú chụp ảnh,
              dán ảnh VietQR hoặc ghi âm, dữ liệu chứng từ được gửi qua máy chủ bảo mật tới{' '}
              <strong>Google Gemini API</strong> để bóc tách chữ viết tay/giọng nói trước khi đối
              chiếu số học và lưu sổ riêng tư cho hộ kinh doanh.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Live SSE Agent Timeline */}
      <AgentTimeline
        events={events}
        isRunning={isRunning}
        finalDecision={finalDecision}
        resultTransaction={resultTransaction}
        onOpenReviewTab={onOpenReviewTab}
        onOpenLedgerTab={onOpenLedgerTab}
      />
    </div>
  );
}
