export function formatVnd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '0 đ';
  }
  return `${Math.round(amount).toLocaleString('vi-VN')} đ`;
}

export function formatDateVi(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
