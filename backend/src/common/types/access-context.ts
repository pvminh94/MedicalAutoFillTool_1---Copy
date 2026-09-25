import type { DataScope } from '../../db/schema/types';

/**
 * Ngữ cảnh truy cập được gắn vào `request.user` sau khi xác thực.
 * Mọi quyết định phân quyền và giới hạn dữ liệu đều dựa trên đối tượng này.
 */
export interface AccessContext {
  id: number;
  username: string;
  fullName: string;
  title: string;
  departmentId: number | null;
  departmentName: string;
  /** Mã các vai trò đang có */
  roles: string[];
  /** Mã toàn bộ quyền hiệu lực (hợp nhất từ các vai trò) */
  permissions: string[];
  /** Phạm vi dữ liệu rộng nhất trong các vai trò */
  dataScope: DataScope;
  /** Danh sách khoa được phép truy cập (rỗng + dataScope=ALL nghĩa là tất cả) */
  departmentIds: number[];
  /** Quản trị tối cao — bỏ qua mọi kiểm tra quyền */
  isSuperAdmin: boolean;
  /** Phiên đăng nhập (để thu hồi token) */
  sessionId: string;
}

export interface JwtPayload {
  sub: number;
  username: string;
  sid: string;
  /** access | refresh */
  typ: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

/** Thông tin máy khách — phục vụ nhật ký kiểm toán */
export interface ClientMeta {
  ip: string;
  userAgent: string;
}

export const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';
