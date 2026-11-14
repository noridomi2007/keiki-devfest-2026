import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, type HouseholdLoginPayload } from '../api/endpoints';
import { AppIcon } from '@/components/AppIcon';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

interface AuthPanelProps {
  onLoginSuccess: (payload: HouseholdLoginPayload, welcomeMsg: string) => void;
  variant?: 'page' | 'embedded';
  initialMode?: 'login' | 'register';
}

/**
 * Shared authentication workspace supporting Google OAuth 2.0 and Phone+scrypt Register/Login.
 */
export function AuthPanel({
  onLoginSuccess,
  variant = 'page',
  initialMode = 'login',
}: AuthPanelProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialMode);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [googleClientId, setGoogleClientId] = useState('');
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');

  useEffect(() => {
    setAuthMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    api
      .getSettingsStatus()
      .then((st) => {
        if (st.google_client_id) {
          setGoogleClientId(st.google_client_id);
          setClientIdInput(st.google_client_id);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (payload: HouseholdLoginPayload) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.loginHousehold(payload);
      onLoginSuccess(
        {
          owner: res.household?.owner || payload.owner,
          name: res.household?.name || payload.name,
          phone: res.household?.phone || payload.phone,
          tax_code: res.household?.tax_code || payload.tax_code,
          address: res.household?.address || payload.address,
          email: res.household?.email || payload.email,
          picture: res.household?.picture || payload.picture,
          auth_method: payload.auth_method,
        },
        res.message
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (authMode === 'register') {
      setLoading(true);
      try {
        const res = await api.registerHousehold({
          phone,
          password,
          owner: ownerName,
          name: shopName,
          tax_code: taxCode,
          address,
        });
        onLoginSuccess(
          {
            owner: res.household?.owner || ownerName,
            name: res.household?.name || shopName,
            phone: res.household?.phone || phone,
            tax_code: res.household?.tax_code || taxCode,
            address: res.household?.address || address,
            auth_method: 'phone',
          },
          res.message
        );
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Lỗi đăng ký tài khoản.');
      } finally {
        setLoading(false);
      }
      return;
    }

    await handleLogin({
      phone,
      password,
      owner: ownerName,
      name: shopName,
      tax_code: taxCode,
      address,
      auth_method: 'phone',
    });
  };

  const ensureGoogleScriptLoaded = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.google?.accounts?.oauth2) {
        resolve(true);
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src*="accounts.google.com/gsi/client"]'
      );
      if (existing) {
        let checks = 0;
        const timer = setInterval(() => {
          checks += 1;
          if (window.google?.accounts?.oauth2) {
            clearInterval(timer);
            resolve(true);
          } else if (checks > 25) {
            clearInterval(timer);
            resolve(false);
          }
        }, 150);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(Boolean(window.google?.accounts?.oauth2));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  };

  const launchRealGooglePopup = async (activeClientId: string) => {
    setErrorMsg(null);
    const trimmedId = activeClientId.trim();

    if (!trimmedId.endsWith('.apps.googleusercontent.com')) {
      setErrorMsg(
        'Mã Client ID chưa đúng định dạng chuẩn của Google (phải kết thúc bằng .apps.googleusercontent.com).'
      );
      setShowGoogleModal(true);
      return;
    }

    setLoading(true);
    const ready = await ensureGoogleScriptLoaded();
    setLoading(false);

    const oauth2 = window.google?.accounts?.oauth2;
    if (!ready || !oauth2) {
      setErrorMsg(
        'Trình duyệt đang chặn hoặc chưa tải được Google Identity Services. Bạn có thể kiểm tra cài đặt Google OAuth bên dưới.'
      );
      setShowGoogleModal(true);
      return;
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: trimmedId,
      scope: 'openid email profile',
      callback: async (tokenResponse) => {
        if (tokenResponse.error || !tokenResponse.access_token) {
          setErrorMsg(`Google OAuth báo lỗi: ${tokenResponse.error || 'Đã hủy đăng nhập'}`);
          return;
        }
        setLoading(true);
        try {
          const res = await api.loginWithGoogle({
            access_token: tokenResponse.access_token,
            shop_name: shopName || 'Hộ kinh doanh (Google)',
            tax_code: taxCode || '',
            address: address || 'TP. Hồ Chí Minh, Việt Nam',
          });
          setShowGoogleModal(false);
          onLoginSuccess(
            {
              owner: res.household?.owner || ownerName,
              name: res.household?.name || shopName,
              phone,
              tax_code: res.household?.tax_code || taxCode,
              address: res.household?.address || address,
              email: res.household?.email,
              picture: res.household?.picture,
              auth_method: 'google',
            },
            res.message
          );
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Xác thực Google thất bại.');
        } finally {
          setLoading(false);
        }
      },
    });

    tokenClient.requestAccessToken();
  };

  const handleGoogleButtonClick = () => {
    if (googleClientId) {
      launchRealGooglePopup(googleClientId);
    } else {
      setShowGoogleModal(true);
    }
  };

  const handleSaveClientIdAndPopup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = clientIdInput.trim();
    if (!cleaned) return;
    setErrorMsg(null);
    try {
      await api.updateGoogleClientId(cleaned);
      setGoogleClientId(cleaned);
      launchRealGooglePopup(cleaned);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu Google Client ID.');
    }
  };

  const formColumn = (
    <div
      className={
        variant === 'embedded'
          ? 'p-6 sm:p-8'
          : 'flex flex-col justify-center p-6 sm:p-8 lg:col-span-6'
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight text-[#111625]">
            {authMode === 'register' ? 'Mở sổ Hộ kinh doanh mới' : 'Đăng nhập vào sổ Keiki'}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#475569]">
            Sử dụng tài khoản Google xác minh hoặc Số điện thoại đã đăng ký.
          </p>
        </div>
      </div>

      {/* Primary Google Sign-In */}
      <div className="mt-5 space-y-2">
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={handleGoogleButtonClick}
          className="h-11 w-full justify-center gap-3 rounded-xl text-sm font-bold text-[#111625] hover:border-[#4285F4]"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
            />
          </svg>
          <span>Tiếp tục với tài khoản Google</span>
        </Button>
      </div>

      {errorMsg && (
        <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-[#B91C1C]/35 bg-red-50 p-3 text-xs font-medium text-[#B91C1C]">
          <AppIcon name="warning" className="shrink-0 text-base" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs font-bold tracking-wider text-[#475569] uppercase">
          Hoặc dùng Số điện thoại
        </span>
        <Separator className="flex-1" />
      </div>

      <Tabs
        value={authMode}
        onValueChange={(val) => {
          setAuthMode(val as 'login' | 'register');
          setErrorMsg(null);
        }}
        className="mb-4"
      >
        <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl bg-[#F6F8FB] p-1">
          <TabsTrigger
            value="login"
            className="cursor-pointer rounded-lg text-xs font-bold data-active:bg-white data-active:text-[#2E2396]"
          >
            Đăng nhập
          </TabsTrigger>
          <TabsTrigger
            value="register"
            className="cursor-pointer rounded-lg text-xs font-bold data-active:bg-white data-active:text-[#2E2396]"
          >
            Đăng ký HKD mới
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={handleFormSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-[#111625]">Số điện thoại</label>
            <Input
              type="tel"
              required
              placeholder="0909 123 456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#111625]">
              {authMode === 'register' ? 'Mật khẩu mới (tối thiểu 8 ký tự)' : 'Mật khẩu'}
            </label>
            <Input
              type="password"
              required
              minLength={authMode === 'register' ? 8 : undefined}
              placeholder="Tối thiểu 8 ký tự"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 font-semibold"
            />
          </div>
        </div>

        {authMode === 'register' && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-[#111625]">
                  Người đại diện / Chủ hộ
                </label>
                <Input
                  type="text"
                  required
                  placeholder="Nguyễn Minh Tâm"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#111625]">
                  Tên Doanh nghiệp / Hộ KD
                </label>
                <Input
                  type="text"
                  required
                  placeholder="Cửa hàng Minh Tâm"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-[#111625]">
                  Mã số thuế DN / HKD
                </label>
                <Input
                  type="text"
                  placeholder="0318899123"
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  className="mt-1 font-mono font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#111625]">
                  Địa chỉ trụ sở / cửa hàng
                </label>
                <Input
                  type="text"
                  placeholder="TP. Hồ Chí Minh"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="mt-2 h-11 w-full rounded-xl text-sm font-bold"
        >
          <AppIcon name={authMode === 'register' ? 'person_add' : 'login'} className="text-lg" />
          {authMode === 'register' ? 'Tạo tài khoản & Mở sổ' : 'Đăng nhập & Mở sổ'}
        </Button>
      </form>
    </div>
  );

  return (
    <>
      {variant === 'embedded' ? (
        <Card className="gap-0 py-0 shadow-xs">{formColumn}</Card>
      ) : (
        <Card className="mx-auto my-6 grid w-full max-w-5xl grid-cols-1 gap-0 py-0 shadow-sm lg:grid-cols-12">
          <div className="notebook-ledger flex flex-col justify-between border-b border-border p-5 pl-6 sm:p-8 lg:col-span-6 lg:border-r lg:border-b-0">
            <div className="sm:pl-10">
              <h1 className="font-heading text-2xl font-extrabold leading-tight tracking-tight text-[#111625] sm:text-3xl">
                Sổ kế toán tự nhiên dành cho Hộ kinh doanh và SME Việt Nam
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                Chụp hóa đơn giấy, dán biên lai VietQR hoặc đọc giao dịch bằng giọng nói. Keiki
                bóc tách chi tiết, đối chiếu chéo chống trùng lặp và tự động lên sổ thu chi – tồn kho rõ ràng.
              </p>

              <div className="mt-6 space-y-2.5 rounded-xl bg-white/95 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#2E2396]">
                  <AppIcon name="lock" className="text-base" />
                  Chuẩn bảo mật sổ sách hộ kinh doanh
                </div>
                <ul className="space-y-2 text-xs leading-relaxed text-[#475569]">
                  <li className="flex items-start gap-2">
                    <AppIcon name="check" className="mt-0.5 text-sm text-[#0B6E54]" />
                    <span>
                      <strong className="text-[#111625]">Cô lập dữ liệu từng hộ:</strong> Chứng từ
                      và sổ sách tách biệt hoàn toàn theo mã hộ / tài khoản đăng nhập.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AppIcon name="check" className="mt-0.5 text-sm text-[#0B6E54]" />
                    <span>
                      <strong className="text-[#111625]">Xác thực chặt chẽ:</strong> Google OAuth
                      2.0 đã xác minh email hoặc SĐT + mật khẩu băm <code>scrypt</code> + Cookie{' '}
                      <code>HttpOnly</code>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AppIcon name="check" className="mt-0.5 text-sm text-[#0B6E54]" />
                    <span>
                      <strong className="text-[#111625]">Xuất Excel sạch công thức:</strong> Đầy
                      đủ trọn bộ sổ thu chi, hàng hóa, dòng tiền và gói ZIP chứng từ phục vụ vay vốn ngân hàng.
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-[#475569] sm:ml-10">
              <AppIcon name="verified_user" className="text-lg text-[#0B6E54]" />
              <span>
                Vận hành trên hạ tầng <strong className="text-[#111625]">Google Cloud</strong> &amp;{' '}
                <strong className="text-[#111625]">Gemini API</strong>.
              </span>
            </div>
          </div>

          {formColumn}
        </Card>
      )}

      {/* Google OAuth 2.0 Client ID Modal */}
      <Dialog open={showGoogleModal} onOpenChange={setShowGoogleModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border bg-[#F6F8FB] px-6 py-4">
            <div className="flex items-center gap-2.5 pr-6">
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <div>
                <DialogTitle className="font-bold text-[#111625]">
                  Đăng nhập bằng Google vào Keiki
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-[#475569]">
                  Kết nối tài khoản Google Workspace / Gmail hộ kinh doanh.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 p-6">
            <form onSubmit={handleSaveClientIdAndPopup} className="space-y-2">
              <p className="text-xs font-bold text-[#2E2396]">
                Đăng nhập với Google OAuth 2.0 Client ID
              </p>
              <p className="text-xs leading-relaxed text-[#475569]">
                Nhập Client ID dạng <code>*.apps.googleusercontent.com</code> để mở cửa sổ đăng nhập
                chính thức của Google.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  type="text"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                  className="h-9 flex-1 bg-white font-mono text-xs"
                />
                <Button type="submit" size="sm" className="h-9 shrink-0 px-4 text-xs">
                  Mở Popup Google
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
