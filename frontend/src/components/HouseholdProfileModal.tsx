import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { AppIcon } from '@/components/AppIcon';
import { api } from '../api/endpoints';
import type { SettingsStatus } from '../types/contract';

interface HouseholdProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  household: SettingsStatus['household'] | undefined;
  onSaved: () => void;
}

export function HouseholdProfileModal({
  open,
  onOpenChange,
  household,
  onSaved,
}: HouseholdProfileModalProps) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [businessSector, setBusinessSector] = useState('');
  const [revenueTier, setRevenueTier] = useState<'under_500m' | '500m_to_3b' | 'over_3b'>(
    '500m_to_3b',
  );
  const [taxMethod, setTaxMethod] = useState<'percentage_revenue' | 'net_income'>(
    'percentage_revenue',
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open && household) {
      setName(household.name || '');
      setOwner(household.owner || '');
      setTaxCode(household.tax_code || '');
      setAddress(household.address || '');
      setPhone(household.phone || '');
      setBusinessSector(household.business_sector || 'Thương mại, dịch vụ & ăn uống');
      setRevenueTier(
        (household.revenue_tier as 'under_500m' | '500m_to_3b' | 'over_3b') || '500m_to_3b',
      );
      setTaxMethod(
        (household.tax_method as 'percentage_revenue' | 'net_income') || 'percentage_revenue',
      );
      setStatusMsg(null);
      setErrorMsg(null);
    }
  }, [open, household]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      await api.updateHouseholdProfile({
        name: name.trim(),
        owner: owner.trim(),
        tax_code: taxCode.trim(),
        address: address.trim(),
        phone: phone.trim(),
        business_sector: businessSector.trim() || 'Thương mại & Dịch vụ tổng hợp',
        revenue_tier: revenueTier,
        tax_method: taxMethod,
      });
      setStatusMsg('Đã lưu hồ sơ hộ kinh doanh — tiêu đề sổ kế toán sẽ tự động cập nhật.');
      onSaved();
    } catch (err) {
      setErrorMsg((err as Error).message || 'Không thể lưu hồ sơ cửa hàng.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setBusy(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setStatusMsg(res.message || 'Đã đổi mật khẩu thành công.');
    } catch (err) {
      setErrorMsg((err as Error).message || 'Không thể đổi mật khẩu.');
    } finally {
      setBusy(false);
    }
  };

  const isPasswordAccount = household?.auth_method === 'password';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-xl">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#111625]">
            <AppIcon name="tune" className="text-xl text-[#2E2396]" />
            Hồ sơ Hộ kinh doanh &amp; Chủ quyền Dữ liệu
          </DialogTitle>
          <DialogDescription className="text-xs text-[#475569]">
            Thông tin này được in tự động lên tiêu đề các mẫu sổ kế toán khi xuất tệp Excel.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSaveProfile} className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-[#111625]">Tên cửa hàng / HKD</label>
              <Input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#111625]">Chủ hộ kinh doanh</label>
              <Input
                type="text"
                required
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-[#111625]">Mã số thuế (MST)</label>
              <Input
                type="text"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                placeholder="0401999888"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#111625]">Số điện thoại</label>
              <Input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#111625]">Địa chỉ kinh doanh</label>
            <Input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#111625]">Ngành nghề chính</label>
            <Input
              type="text"
              value={businessSector}
              onChange={(e) => setBusinessSector(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-[#111625]">Nhóm doanh thu năm</label>
              <select
                value={revenueTier}
                onChange={(e) =>
                  setRevenueTier(e.target.value as 'under_500m' | '500m_to_3b' | 'over_3b')
                }
                className="mt-1 h-10 w-full rounded-xl border border-border bg-[#F6F8FB] px-3 text-xs font-semibold text-[#111625]"
              >
                <option value="under_500m">Dưới 500 triệu/năm (Miễn thuế)</option>
                <option value="500m_to_3b">Từ 500 triệu – 3 tỷ/năm</option>
                <option value="over_3b">Trên 3 tỷ/năm (Khấu trừ / Thu nhập ròng)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#111625]">Phương pháp tính thuế</label>
              <select
                value={taxMethod}
                onChange={(e) =>
                  setTaxMethod(e.target.value as 'percentage_revenue' | 'net_income')
                }
                className="mt-1 h-10 w-full rounded-xl border border-border bg-[#F6F8FB] px-3 text-xs font-semibold text-[#111625]"
              >
                <option value="percentage_revenue">Tỷ lệ % trên doanh thu (S2a-HKD)</option>
                <option value="net_income">Doanh thu trừ chi phí (S2b/S2c-HKD)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <a
              href={api.getHouseholdBackupUrl()}
              download
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-[#F6F8FB] px-3 py-2 text-xs font-bold text-[#2E2396] hover:bg-[#ECEFF7]"
            >
              <AppIcon name="download" className="text-sm" />
              Tải bản sao lưu JSON toàn bộ sổ
            </a>

            <Button type="submit" size="sm" disabled={busy}>
              <AppIcon name="fact_check" className="text-sm" />
              Lưu hồ sơ HKD
            </Button>
          </div>
        </form>

        {isPasswordAccount && (
          <>
            <Separator />
            <form onSubmit={handleChangePassword} className="space-y-2.5 text-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#111625]">
                <AppIcon name="key" className="text-sm text-[#0B6E54]" />
                <span>Đổi mật khẩu tài khoản SĐT</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Mật khẩu hiện tại"
                  required
                />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
                  required
                  minLength={8}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="outline" size="sm" disabled={busy}>
                  Cập nhật mật khẩu
                </Button>
              </div>
            </form>
          </>
        )}

        {statusMsg && (
          <div className="rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-[#0B6E54]">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-xl bg-red-50 px-3.5 py-2 text-xs font-semibold text-[#B91C1C]">
            {errorMsg}
          </div>
        )}

        <DialogFooter className="border-t border-border pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
