/** Kiểu dữ liệu dùng chung phía giao diện (khớp với backend NestJS) */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CurrentUser {
  id: number;
  username: string;
  fullName: string;
  title: string;
  email?: string;
  phone?: string;
  departmentId: number | null;
  departmentName: string;
  roles: string[];
  permissions: string[];
  dataScope: 'OWN' | 'DEPT' | 'ALL';
  departmentIds: number[];
  isSuperAdmin: boolean;
  sessionId: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: CurrentUser;
  mustChangePassword?: boolean;
}

export interface Notification {
  id: number;
  title: string;
  body: string;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  link: string;
  module: string;
  entityId: string;
  readAt: string | null;
  createdAt: string;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  shortName: string;
  hospital: string;
  reportCode: string;
  parentId: number | null;
  level: number;
  path: string;
  kind: string;
  phone: string;
  email: string;
  headName: string;
  note: string;
  reportEnabled: boolean;
  sortOrder: number;
  active: boolean;
  userCount?: number;
  children?: Department[];
  parentName?: string;
}

export interface HsbaSignature {
  id: number;
  stepKey: string;
  stepName: string;
  userId: number;
  username: string;
  fullName: string;
  title: string;
  note: string;
  contentHash: string;
  ip: string;
  signedAt: string;
}

export interface HsbaTimelineStep {
  index: number;
  key: string;
  name: string;
  title: string;
  kind: string;
  roleCodes: string[];
  allowReturn: boolean;
  requireNote: boolean;
  state: 'SIGNED' | 'PENDING' | 'WAITING' | 'SKIPPED';
  canSignCurrent: boolean;
  signature: HsbaSignature | null;
}

export interface HsbaRequest {
  id: number;
  code: string;
  status: string;
  statusLabel?: string;
  pendingStepKey: string;
  currentStep: number;
  workflowId: number | null;
  requesterId: number | null;
  requesterName: string;
  requesterTitle: string;
  departmentId: number | null;
  departmentName: string;
  patientName: string;
  patientBirthYear: string;
  patientBirthDate: string | null;
  patientGender: string;
  patientCode: string;
  patientAddress: string;
  maKcb: string;
  maTheBhyt: string;
  ngayVaoVien: string | null;
  ngayRaVien: string | null;
  doiTuong: string;
  reason: string;
  content: string;
  amount: string;
  attachmentsNote: string;
  extraFields: Record<string, unknown>;
  priority: string;
  internalNote: string;
  returnReason: string;
  returnCount: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  signatures?: HsbaSignature[];
  timeline?: HsbaTimelineStep[];
  logs?: {
    id: number;
    action: string;
    detail: string;
    fullName: string;
    username: string;
    fromStatus: string;
    toStatus: string;
    createdAt: string;
  }[];
  integrity?: { stepKey: string; valid: boolean }[];
}

export interface ReportColumn {
  id?: number;
  colKey: string;
  label: string;
  groupLabel?: string;
  kind: 'INPUT' | 'CALC';
  formula?: string;
  format?: string;
  summaryKey?: string;
  unit?: string;
  width?: number;
  align?: string;
  sortOrder?: number;
  archived?: boolean;
}

export interface ReportRowDef {
  id?: number;
  blockId?: number | null;
  groupLabel?: string;
  rowLabel: string;
  agg?: 'SUM' | 'FIRST' | 'LAST' | 'AVG' | 'MIN' | 'MAX';
  unit?: string;
  isBold?: boolean;
  isTotal?: boolean;
  formula?: string;
  note?: string;
  sortOrder?: number;
  archived?: boolean;
}

export interface ReportTemplate {
  id: number;
  departmentId: number;
  departmentName?: string;
  code: string;
  name: string;
  title: string;
  subtitle: string;
  footerNote: string;
  defaultPeriod: string;
  printTemplateId: number | null;
  version: number;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
  columnCount?: number;
  rowCount?: number;
}

export interface ReportTemplateFull {
  template: ReportTemplate;
  columns: ReportColumn[];
  sections: {
    id: number;
    code: string;
    title: string;
    note: string;
    sortOrder: number;
    blocks: { id: number; label: string; note: string; sortOrder: number; rows: ReportRowDef[] }[];
    rows: ReportRowDef[];
  }[];
}

export interface ReportCell {
  colKey: string;
  value: number;
  formatted: string;
  samples: number;
}

export interface ReportRowResult {
  rowId: number;
  blockId: number | null;
  groupLabel: string;
  rowLabel: string;
  unit: string;
  agg: string;
  isBold: boolean;
  isTotal: boolean;
  note: string;
  cells: ReportCell[];
}

export interface ReportBuild {
  template: {
    id: number;
    code: string;
    name: string;
    title: string;
    subtitle: string;
    footerNote: string;
    departmentId: number;
    departmentName: string;
    printTemplateId: number | null;
  };
  period: { from: string; to: string; label: string; mode: string; days: number };
  columns: ReportColumn[];
  sections: { id: number; title: string; note: string; blocks: { id: number | null; label: string; note: string; rows: ReportRowResult[] }[] }[];
  totals: Record<string, number>;
  completeness: { days: number; daysWithData: number; ratio: number };
  entryCount: number;
}

export interface EntryGrid {
  template: ReportTemplate;
  columns: ReportColumn[];
  sections: ReportTemplateFull['sections'];
  period: { from: string; to: string; label: string; mode: string; days: number };
  days: string[];
  values: Record<string, number>;
  notes: Record<string, string>;
  perDay: Record<string, number>;
  stats: { totalCells: number; filledCells: number; entryCount: number };
}

export interface DashboardSummary {
  scope: { dataScope: string; departmentIds: number[]; departmentId: number | null; isSuperAdmin: boolean };
  hsba: { total: number; pending: number; completed: number; returned: number; today: number; trend: { day: string; total: number; completed: number }[] };
  reports: {
    departments: number;
    departmentsToday: number;
    entriesToday: number;
    entriesPeriod: number;
    trend: { day: string; cells: number }[];
  };
  users: { users: number; active: number };
  departments: { total: number; reportable: number };
  jobs: { id: number; code: string; name: string; cron: string; lastStatus: string | null; lastRunAt: string | null; runCount: number; failCount: number; active: boolean }[];
  recentAudit: { id: number; username: string; fullName: string; action: string; module: string; entity: string; description: string; createdAt: string }[];
}
