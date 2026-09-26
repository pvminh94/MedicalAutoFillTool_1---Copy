import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  Layers,
  PenLine,
  Printer,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  DatabaseBackup,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Quyền tối thiểu để hiện mục này (bỏ trống = ai cũng thấy) */
  permission?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Menu điều hướng — mục nào không đủ quyền sẽ tự ẩn.
 * Quản trị viên có thể thêm tiện ích mới trong mục "Tiện ích" mà không cần sửa mã nguồn.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Tổng quan',
    items: [{ href: '/dashboard', label: 'Bảng điều khiển', icon: LayoutDashboard, permission: 'dashboard.view' }],
  },
  {
    label: 'Hồ sơ bệnh án',
    items: [
      { href: '/ho-so-benh-an', label: 'Phiếu đề nghị sửa', icon: ClipboardList, permission: 'hsba.request.view' },
      { href: '/ho-so-benh-an/tao-moi', label: 'Tạo phiếu mới', icon: PenLine, permission: 'hsba.request.create' },
      { href: '/ho-so-benh-an/quy-trinh', label: 'Quy trình ký', icon: Layers, permission: 'hsba.workflow.view' },
    ],
  },
  {
    label: 'Báo cáo khoa',
    items: [
      { href: '/bao-cao/nhap-lieu', label: 'Nhập số liệu', icon: FileSpreadsheet, permission: 'report.entry.view' },
      { href: '/bao-cao', label: 'Xem báo cáo', icon: BarChart3, permission: 'report.view.view' },
      { href: '/bao-cao/tong-hop', label: 'Tổng hợp toàn viện', icon: Activity, permission: 'report.summary.view' },
      { href: '/bao-cao/mau', label: 'Mẫu báo cáo', icon: FileText, permission: 'report.template.view' },
    ],
  },
  {
    label: 'Quản trị hệ thống',
    items: [
      { href: '/quan-tri/khoa-phong', label: 'Khoa phòng', icon: Building2, permission: 'department.view' },
      { href: '/quan-tri/nguoi-dung', label: 'Người dùng', icon: Users, permission: 'user.view' },
      { href: '/quan-tri/vai-tro', label: 'Vai trò & quyền', icon: ShieldCheck, permission: 'role.view' },
      { href: '/quan-tri/mau-in', label: 'Thiết kế bản in', icon: Printer, permission: 'print.template.view' },
      { href: '/quan-tri/tien-ich', label: 'Tiện ích', icon: SlidersHorizontal, permission: 'utility.view' },
      { href: '/quan-tri/tac-vu', label: 'Tác vụ định kỳ', icon: CalendarClock, permission: 'job.view' },
      { href: '/quan-tri/sao-luu', label: 'Sao lưu & phục hồi', icon: DatabaseBackup, permission: 'backup.view' },
      { href: '/quan-tri/cau-hinh', label: 'Cấu hình hệ thống', icon: Settings2, permission: 'setting.view' },
      { href: '/quan-tri/nhat-ky', label: 'Nhật ký kiểm toán', icon: History, permission: 'audit.log.view' },
    ],
  },
];
