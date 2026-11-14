import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { HouseholdLoginPayload } from '../api/endpoints';
import { AuthPanel } from '../components/AuthPanel';
import { KeikiMark } from '../components/KeikiMark';
import { AppIcon } from '@/components/AppIcon';

function speakGuideLocally(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) {
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find((v) => v.lang.toLowerCase().startsWith('vi'));
    if (!viVoice) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = viVoice;
    u.lang = 'vi-VN';
    window.speechSynthesis.speak(u);
  } catch {
    // ignore speech errors
  }
}

interface LoginPageProps {
  largeText: boolean;
  onToggleLargeText: () => void;
  onOpenMobileModal: () => void;
  onBackToLanding?: () => void;
  initialMode?: 'login' | 'register';
  onLoginSuccess: (payload: HouseholdLoginPayload, welcomeMsg: string) => void;
}

export function LoginPage({
  largeText,
  onToggleLargeText,
  onOpenMobileModal,
  onBackToLanding,
  initialMode = 'login',
  onLoginSuccess,
}: LoginPageProps) {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#F6F8FB] text-[#111625]">
      {/* Sticky Minimal Top Bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {onBackToLanding && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onBackToLanding}
                className="h-9 text-xs font-bold"
              >
                <AppIcon name="arrow_back" className="text-base" />
                <span className="hidden sm:inline">Trang giới thiệu</span>
              </Button>
            )}
            <div className="flex items-center gap-2.5">
              <KeikiMark className="h-9 w-9" />
              <div className="flex items-center gap-2">
                <span className="font-heading text-lg font-extrabold tracking-tight text-[#111625]">
                  Keiki
                </span>
                <Badge variant="outline" className="hidden font-mono text-xs text-[#2E2396] sm:inline-flex">
                  TT 152/2025
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenMobileModal}
              className="h-9 border-[#2E2396]/30 text-xs font-bold text-[#2E2396]"
            >
              <AppIcon name="qr_code_scanner" className="text-base" />
              <span className="hidden sm:inline">Mở trên Điện thoại</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                speakGuideLocally(
                  'Xin chào quý doanh nghiệp và hộ kinh doanh. Bạn có thể đăng nhập bằng Google hoặc đăng ký bằng số điện thoại để mở sổ kế toán Keiki.'
                )
              }
              className="h-9 text-xs font-bold"
            >
              <AppIcon name="volume_up" className="text-base" />
              <span className="hidden md:inline">Nghe hướng dẫn</span>
            </Button>

            <Button
              type="button"
              variant={largeText ? 'default' : 'outline'}
              size="sm"
              onClick={onToggleLargeText}
              className="h-9 text-xs font-bold"
            >
              <AppIcon name="format_size" className="text-base" />
              <span className="hidden sm:inline">Chữ to</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center px-4 py-4 sm:px-6">
        <AuthPanel
          variant="page"
          initialMode={initialMode}
          onLoginSuccess={onLoginSuccess}
        />
      </main>

      <footer className="px-4 py-5 text-center text-xs text-[#475569]">
        Hỗ trợ Doanh nghiệp Vừa &amp; Nhỏ (SME) và Hộ Kinh Doanh toàn quốc • Google Gemini &amp;
        Google Cloud
      </footer>
    </div>
  );
}
