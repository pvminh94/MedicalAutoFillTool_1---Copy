import { Badge } from '@/components/ui/card';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'muted' | 'info' | 'danger'> = {
  HOAN_TAT: 'success',
  TRA_LAI: 'warning',
  DA_HUY: 'muted',
  CHO_DE_NGHI: 'info',
  CHO_KHTB: 'info',
  CHO_TC: 'info',
};

const STATUS_LABEL: Record<string, string> = {
  CHO_DE_NGHI: 'Chờ người đề nghị xác nhận',
  CHO_KHTB: 'Chờ Duyệt/TB.KHTH',
  CHO_TC: 'Chờ TC xác nhận hủy thanh toán',
  HOAN_TAT: 'Hoàn tất',
  TRA_LAI: 'Đã trả lại',
  DA_HUY: 'Đã hủy',
};

/** Nhãn trạng thái phiếu sửa hồ sơ bệnh án. */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'info'}>{label ?? STATUS_LABEL[status] ?? status}</Badge>;
}
