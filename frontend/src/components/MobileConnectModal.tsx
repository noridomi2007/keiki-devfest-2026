import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { AppIcon } from '@/components/AppIcon';

interface MobileConnectModalProps {
  open: boolean;
  onClose: () => void;
  lanUrls: string[];
  mobilePreview: boolean;
  onToggleMobilePreview: () => void;
}

export function MobileConnectModal({
  open,
  onClose,
  lanUrls,
  mobilePreview,
  onToggleMobilePreview,
}: MobileConnectModalProps) {
  const [selectedUrlIdx, setSelectedUrlIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeUrl =
    lanUrls[selectedUrlIdx] ||
    lanUrls[0] ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard errors in restricted contexts
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border bg-[#F6F8FB] px-5 py-4">
          <div className="flex items-center gap-2.5 pr-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2E2396]/10 text-[#2E2396]">
              <AppIcon name="smartphone" className="text-xl" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-[#111625]">
                Sử dụng Keiki trên Điện thoại (iOS &amp; Android)
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-[#475569]">
                Hỗ trợ PWA, Camera chụp hóa đơn, dán ảnh VietQR &amp; ghi âm giọng nói.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 p-5">
          {/* Option 1: Toggle Mobile Frame Preview */}
          <div className="rounded-xl bg-[#E8ECF6]/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#2E2396]">
                  1. Xem giao diện Điện thoại (390×844px) ngay trên màn hình
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[#475569]">
                  Kiểm thử trực tiếp thanh điều hướng 4 tab và thao tác một tay.
                </p>
              </div>
              <Button
                type="button"
                variant={mobilePreview ? 'destructive-solid' : 'default'}
                size="lg"
                onClick={() => {
                  onToggleMobilePreview();
                  onClose();
                }}
                className="shrink-0"
              >
                {mobilePreview ? 'Thoát khung ĐT' : 'Bật khung ĐT'}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Option 2: Scan / Open over Wi-Fi */}
          <div className="space-y-3">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-[#111625]">
                  2. Mở trên Điện thoại thật qua mạng Wi-Fi nội bộ
                </span>
                <Badge variant="emerald">Zero Third-Party Leak</Badge>
              </div>
              <p className="mt-1 text-xs text-[#475569]">
                Đảm bảo điện thoại và máy tính dùng chung mạng Wi-Fi, sau đó mở địa chỉ bên dưới:
              </p>
            </div>

            {lanUrls.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {lanUrls.map((u, idx) => (
                  <Button
                    key={u}
                    type="button"
                    size="sm"
                    variant={idx === selectedUrlIdx ? 'default' : 'outline'}
                    onClick={() => setSelectedUrlIdx(idx)}
                    className="font-mono text-xs"
                  >
                    {u}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex flex-col items-stretch gap-3 rounded-xl bg-[#F6F8FB] p-4 sm:flex-row sm:items-center">
              <div className="flex h-28 w-full shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-white p-3 text-center sm:w-32">
                <AppIcon name="devices" className="text-4xl text-[#2E2396]" />
                <span className="mt-1 text-xs font-semibold text-[#475569]">
                  LAN Localhost
                </span>
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs font-semibold text-[#2E2396] break-all">
                  {activeUrl}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="emerald" size="sm" onClick={handleCopy}>
                    <AppIcon name={copied ? 'check' : 'content_copy'} className="text-base" />
                    {copied ? 'Đã sao chép!' : 'Sao chép đường dẫn'}
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-[#475569]">
                  Sau khi mở trên Safari hoặc Chrome điện thoại, chọn{' '}
                  <strong className="text-[#111625]">Thêm vào Màn hình chính</strong> để dùng như ứng dụng độc lập.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
