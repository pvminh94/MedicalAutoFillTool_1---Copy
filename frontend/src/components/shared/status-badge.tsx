import { Badge } from '@/components/ui/card';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'muted' | 'info' | 'danger'> = {
  HOAN_TAT: 'success',
  TRA_LAI: 'warning',
  DA_HUY: 'muted',
};

/** Tên bước ký hiển thị được khi trạng thái là `CHO_<BƯỚC>`. */
const STEP_LABEL: Record<string, string> = {
  DE_NGHI: 'người đề nghị xác nhận',
  KHTB: 'Duyệt/TB.KHTH xử lý',
  TAICHINH: 'tài chính xác nhận hủy thanh toán',
};

/** Nhãn trạng thái phiếu sửa hồ sơ bệnh án (mọi bước ký đều hiển thị được). */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const stepKey = status.startsWith('CHO_') ? status.slice(4) : '';
  const text =
    label ??
    (stepKey ? `Chờ ${STEP_LABEL[stepKey] ?? `bước ${stepKey}`}` : status);
  const tone = STATUS_TONE[status] ?? (status.startsWith('CHO_') ? 'info' : 'info');
  return <Badge tone={tone}>{text}</Badge>;
}
