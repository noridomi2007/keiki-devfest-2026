import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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

export const VIETNAM_SME_PROFILES: HouseholdLoginPayload[] = [
  {
    owner: 'Nguyễn Minh Tâm',
    name: 'Cửa hàng Thương mại & Thực phẩm Minh Tâm',
    phone: '0909 123 456',
    tax_code: '0318899123',
    address: '142 Nguyễn Thị Minh Khai, Quận 3, TP. Hồ Chí Minh',
    email: 'minhtam.store.vn@gmail.com',
    auth_method: 'preset',
  },
  {
    owner: 'Trần Quốc Hoàng',
    name: 'Công ty TNHH TM & Dịch vụ Hoàng Gia (SME)',
    phone: '0912 888 999',
    tax_code: '0107766554',
    address: '86 Cầu Giấy, Quận Cầu Giấy, TP. Hà Nội',
    email: 'hoanggia.sme.hn@gmail.com',
    auth_method: 'preset',
  },
  {
    owner: 'Lê Thị Mai',
    name: 'Chuỗi Cà phê & Đặc sản Sông Hàn',
    phone: '0905 456 789',
    tax_code: '0406655443',
    address: '68 Nguyễn Văn Linh, Quận Hải Châu, TP. Đà Nẵng',
    email: 'songhan.coffee.vn@gmail.com',
    auth_method: 'preset',
  },
];

interface AuthPanelProps {
  onLoginSuccess: (payload: HouseholdLoginPayload, welcomeMsg: string) => void;
  variant?: 'page' | 'embedded';
  initialMode?: 'login' | 'register';
}

/**
 * Shared authentication workspace supporting Google OAuth 2.0, Phone+scrypt Register/Login,
 * and server-gated demo preset login.
 */
export function AuthPanel({
  onLoginSuccess,
  variant = 'page',
  initialMode = 'login',
}: AuthPanelProps) {
  const [demoMode, setDemoMode] = useState(false);
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
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');

  useEffect(() => {
    setAuthMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    api
      .getSettingsStatus()
      .then((st) => {
        setDemoMode(Boolean(st.demo_mode));
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

  const handleClearClientId = async () => {
    try {
      await api.updateGoogleClientId('');
      setGoogleClientId('');
      setClientIdInput('');
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa Google Client ID.');
    }
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
      if (demoMode) {
        await api.updateGoogleClientId(cleaned);
      }
      setGoogleClientId(cleaned);
      launchRealGooglePopup(cleaned);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu Google Client ID.');
    }
  };

  const handleQuickGoogleAccountSelect = async (email: string, name: string, shop?: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.loginWithGoogle({
        email,
        name,
        shop_name: shop || shopName || 'Cửa hàng Thương mại & Thực phẩm Minh Tâm',
        tax_code: taxCode || '0318899123',
        address: address || 'Việt Nam',
      });
      setShowGoogleModal(false);
      onLoginSuccess(
        {
          owner: name,
          name: shop || shopName,
          phone,
          tax_code: taxCode,
          address,
          email,
          auth_method: 'google',
        },
        res.message
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Đăng nhập Google thất bại.');
    } finally {
      setLoading(false);
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
        {demoMode && (
          <Badge variant="emerald" className="shrink-0">
            Demo Mode
          </Badge>
        )}
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

        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs text-[#475569]">
          <span className="inline-flex items-center gap-1">
            {googleClientId ? (
              <>
                <AppIcon name="check_circle" className="text-sm text-[#0B6E54]" />
                Đã cấu hình Google OAuth 2.0 Client ID
              </>
            ) : demoMode ? (
              'Hỗ trợ OAuth 2.0 Popup hoặc Chọn nhanh Gmail mẫu'
            ) : (
              'Xác thực qua Google Identity OAuth 2.0'
            )}
          </span>
          <div className="flex items-center gap-3">
            {googleClientId && (
              <button
                type="button"
                onClick={handleClearClientId}
                className="cursor-pointer font-semibold text-[#B91C1C] hover:underline"
              >
                Xóa ID
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowGoogleModal(true)}
              className="cursor-pointer font-semibold text-[#2E2396] hover:underline"
            >
              {googleClientId ? 'Đổi tài khoản / Cài đặt' : 'Cài đặt OAuth ID'}
            </button>
          </div>
        </div>
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
              required={authMode === 'register' || !demoMode}
              minLength={authMode === 'register' ? 8 : undefined}
              placeholder={
                demoMode && authMode === 'login' ? 'Tùy chọn khi bật Demo' : 'Tối thiểu 8 ký tự'
              }
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

      {/* Compact Demo Presets when rendered inline on Landing */}
      {variant === 'embedded' && demoMode && (
        <div className="mt-5">
          <Separator className="mb-4" />
          <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-[#2E2396]">
            <AppIcon name="bolt" className="text-sm" />
            Vào nhanh hồ sơ mẫu (Demo)
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {VIETNAM_SME_PROFILES.map((hh, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => handleLogin(hh)}
                className="cursor-pointer rounded-xl border border-border bg-[#F6F8FB] px-3 py-2.5 text-left text-xs transition hover:border-[#2E2396] hover:bg-white"
              >
                <div className="truncate font-bold text-[#111625]">{hh.owner}</div>
                <div className="truncate font-mono text-xs text-[#475569]">
                  MST {hh.tax_code}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
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
                tách bóc chi tiết, đối chiếu chéo chống trùng lặp và lập trọn bộ sổ thuế S1a–S2e (TT 152/2025).
              </p>

              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-[#2E2396]/30 text-[#2E2396]">
                  <AppIcon name="verified" className="text-sm" />
                  Thông tư 152/2025/TT-BTC
                </Badge>
              </div>

              {demoMode ? (
                <div className="mt-6">
                  <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-[#2E2396]">
                    <AppIcon name="bolt" className="text-base" />
                    Chọn nhanh hồ sơ mẫu (Bắc – Trung – Nam)
                  </p>
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
                    {VIETNAM_SME_PROFILES.map((hh, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={loading}
                        onClick={() => handleLogin(hh)}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 p-3.5 text-left transition hover:bg-[#F6F8FB]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8ECF6] font-mono text-xs font-bold text-[#2E2396]">
                            {(hh.owner || 'K').slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-bold text-[#111625]">{hh.name}</div>
                            <div className="font-mono text-xs text-[#475569] tabular-nums">
                              {hh.owner} • MST {hh.tax_code}
                            </div>
                          </div>
                        </div>
                        <AppIcon name="arrow_forward" className="shrink-0 text-xl text-[#2E2396]" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
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
                        đủ trọn bộ sổ S1a–S2e (TT 152/2025) và gói ZIP chứng từ phục vụ vay vốn ngân hàng.
                      </span>
                    </li>
                  </ul>
                </div>
              )}
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

      {/* Google Account Chooser & OAuth 2.0 Client ID Modal */}
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
            {demoMode ? (
              <div>
                <p className="text-xs font-bold text-[#475569]">
                  Chọn nhanh tài khoản Google mẫu (Demo Mode):
                </p>
                <div className="mt-2.5 divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {VIETNAM_SME_PROFILES.map((hh, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        handleQuickGoogleAccountSelect(hh.email!, hh.owner || 'Demo', hh.name)
                      }
                      className="flex w-full cursor-pointer items-center gap-3 bg-white p-3 text-left transition hover:bg-[#F6F8FB]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4285F4] text-sm font-bold text-white">
                        {(hh.owner || 'D').slice(-1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-[#111625]">{hh.owner}</div>
                        <div className="truncate text-xs text-[#475569]">{hh.email}</div>
                      </div>
                      <span className="text-xs font-semibold text-[#2E2396]">Chọn</span>
                    </button>
                  ))}
                </div>

                <div className="mt-3 rounded-xl bg-[#F6F8FB] p-3.5">
                  <div className="text-xs font-bold text-[#111625]">
                    Hoặc nhập Gmail thử nghiệm:
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      type="email"
                      value={customGoogleEmail}
                      onChange={(e) => setCustomGoogleEmail(e.target.value)}
                      placeholder="tenban@gmail.com"
                      className="h-9 bg-white text-xs"
                    />
                    <Input
                      type="text"
                      value={customGoogleName}
                      onChange={(e) => setCustomGoogleName(e.target.value)}
                      placeholder="Họ và tên"
                      className="h-9 bg-white text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() =>
                      handleQuickGoogleAccountSelect(customGoogleEmail, customGoogleName)
                    }
                    className="mt-2.5 h-9 w-full bg-[#4285F4] text-xs font-bold text-white hover:bg-blue-700"
                  >
                    Tiếp tục với {customGoogleEmail || 'Gmail này'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-50 p-3.5 text-xs leading-relaxed text-[#92400E]">
                <strong>Chế độ Production:</strong> Chỉ chấp nhận Google ID Token / Access Token hợp
                lệ được cấp bởi Google OAuth 2.0 Client ID đã cấu hình. Hoặc sử dụng Số điện thoại
                và Mật khẩu đã đăng ký.
              </div>
            )}

            <Separator />

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
