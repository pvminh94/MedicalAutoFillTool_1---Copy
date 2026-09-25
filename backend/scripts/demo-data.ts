/**
 * Tạo dữ liệu mẫu để xem giao diện: người dùng theo vai trò, phiếu sửa HSBA ở mọi
 * trạng thái và số liệu báo cáo của một khoa trong vài ngày.
 *
 * Toàn bộ dữ liệu đều đi qua API thật (không ghi thẳng CSDL) nên đúng nghiệp vụ:
 * phiếu được ký lần lượt bởi người đề nghị → TB.KHTH → Tài chính.
 *
 *   npm run db:demo
 *
 * CẢNH BÁO: chỉ dùng cho môi trường thử nghiệm.
 */
import { config as loadEnv } from 'dotenv';

loadEnv();

const BASE = process.env.DEMO_API_BASE ?? `http://127.0.0.1:${process.env.PORT ?? 4000}/api`;
const ADMIN = {
  username: process.env.DEMO_ADMIN_USER ?? 'admin',
  password: process.env.DEMO_ADMIN_PASS ?? 'Admin@123',
};
const DEMO_PASSWORD = '123456';

interface ApiResult<T> {
  success: boolean;
  data: T;
  message?: string;
}

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let payload: ApiResult<T> | { message?: string } | null = null;
  try {
    payload = JSON.parse(text) as ApiResult<T>;
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message =
      (payload as { message?: string | string[] } | null)?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`${options.method ?? 'GET'} ${path} → ${Array.isArray(message) ? message[0] : message}`);
  }
  return (payload as ApiResult<T>).data;
}

async function login(username: string, password: string): Promise<string> {
  const result = await call<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  return result.accessToken;
}

const log = (...args: unknown[]): void => console.log('  ', ...args);

async function ensureUsers(adminToken: string): Promise<{
  requesterToken: string;
  khtbToken: string;
  financeToken: string;
  requester: { id: number; fullName: string; departmentId: number | null };
  khtb: { id: number; fullName: string };
  finance: { id: number; fullName: string };
}> {
  const departments = await call<{ id: number; code: string; name: string }[]>('/departments/options', {
    token: adminToken,
  });
  const surgery = departments.find((d) => d.code === 'KPK') ?? departments[0];
  const khth = departments.find((d) => d.code === 'KHTB') ?? departments[0];

  const users = await call<{ items: { id: number; username: string; fullName: string; departmentId: number | null }[] }>(
    '/users?pageSize=200',
    { token: adminToken },
  );
  const byName = new Map(users.items.map((u) => [u.username, u]));

  const specs = [
    {
      username: 'bs.minh',
      fullName: 'Nguyễn Văn Minh',
      title: 'Bác sĩ điều trị',
      departmentId: surgery.id,
      roleCodes: ['NHAP_LIEU'],
    },
    {
      username: 'khtb.lan',
      fullName: 'Trần Thị Lan',
      title: 'Chuyên viên KHTH',
      departmentId: khth.id,
      roleCodes: ['KHTB'],
    },
    {
      username: 'tc.hoa',
      fullName: 'Lê Thị Hoa',
      title: 'Kế toán viên',
      departmentId: khth.id,
      roleCodes: ['TAI_CHINH'],
    },
  ];

  for (const spec of specs) {
    if (byName.has(spec.username)) {
      log(`= Người dùng ${spec.username} đã có`);
      continue;
    }
    const created = await call<{ id: number; username: string; fullName: string; departmentId: number | null }>(
      '/users',
      { method: 'POST', token: adminToken, body: { ...spec, password: DEMO_PASSWORD } },
    );
    byName.set(created.username, created);
    log(`+ Người dùng ${created.fullName} (${created.username}) — vai trò ${spec.roleCodes.join(', ')}`);
  }

  const requester = byName.get('bs.minh');
  const khtb = byName.get('khtb.lan');
  const finance = byName.get('tc.hoa');
  if (!requester || !khtb || !finance) throw new Error('Không tạo/không tìm thấy người dùng mẫu');

  return {
    requesterToken: await login('bs.minh', DEMO_PASSWORD),
    khtbToken: await login('khtb.lan', DEMO_PASSWORD),
    financeToken: await login('tc.hoa', DEMO_PASSWORD),
    requester,
    khtb,
    finance,
  };
}

interface Signer {
  token: string;
  fullName: string;
}

/** Tạo một phiếu và ký tới bước mong muốn (0 = chưa ký bước nào). */
async function createRequest(
  adminToken: string,
  spec: {
    patientName: string;
    year: string;
    gender: string;
    maKcb: string;
    maTheBhyt: string;
    reason: string;
    content: string;
    amount: number;
    enter: string;
    leave: string;
    priority?: string;
  },
  ctx: {
    requester: { id: number; fullName: string; departmentId: number | null };
    departmentId: number;
    departmentName: string;
    requesters: Signer;
    khtb: Signer;
    finance: Signer;
  },
  signSteps: number,
): Promise<{ id: number; code: string }> {
  const created = await call<{ id: number; code: string }>('/hsba/requests', {
    method: 'POST',
    token: adminToken,
    body: {
      requesterId: ctx.requester.id,
      requesterName: ctx.requester.fullName,
      requesterTitle: 'Bác sĩ điều trị',
      departmentId: ctx.departmentId,
      departmentName: ctx.departmentName,
      priority: spec.priority ?? 'NORMAL',
      patientName: spec.patientName,
      patientBirthYear: spec.year,
      patientGender: spec.gender,
      maKcb: spec.maKcb,
      maTheBhyt: spec.maTheBhyt,
      ngayVaoVien: spec.enter,
      ngayRaVien: spec.leave,
      doiTuong: 'BHYT',
      reason: spec.reason,
      content: spec.content,
      amount: String(spec.amount),
      signNow: false,
    },
  });

  const signers = [ctx.requesters, ctx.khtb, ctx.finance].slice(0, Math.max(0, Math.min(3, signSteps)));
  for (const signer of signers) {
    await call(`/hsba/requests/${created.id}/sign`, {
      method: 'POST',
      token: signer.token,
      body: { note: '' },
    });
  }
  log(`+ Phiếu ${created.code} — ${spec.patientName} (${signSteps}/3 bước ký)`);
  return created;
}

async function createReportEntries(adminToken: string): Promise<void> {
  const templates = await call<{ items: { id: number; code: string; departmentName: string }[] }>(
    '/reports/templates?pageSize=50',
    { token: adminToken },
  );
  const template = templates.items[0];
  if (!template) {
    log('! Chưa có mẫu báo cáo nào — bỏ qua phần số liệu');
    return;
  }

  const grid = await call<{
    columns: { colKey: string; kind: string }[];
    sections: { rows: { id: number; rowLabel: string }[]; blocks: { rows: { id: number; rowLabel: string }[] }[] }[];
  }>(`/reports/entries/grid?templateId=${template.id}&period=day&date=${new Date().toISOString().slice(0, 10)}`, {
    token: adminToken,
  });

  const rows = grid.sections.flatMap((s) => [...s.rows, ...s.blocks.flatMap((b) => b.rows)]);
  const inputCols = grid.columns.filter((c) => c.kind === 'INPUT');
  if (rows.length === 0 || inputCols.length === 0) {
    log('! Mẫu báo cáo chưa có dòng/cột nhập liệu — bỏ qua');
    return;
  }

  let saved = 0;
  for (let offset = 4; offset >= 0; offset--) {
    const day = new Date();
    day.setDate(day.getDate() - offset);
    const entryDate = day.toISOString().slice(0, 10);
    const values = rows.flatMap((row) =>
      inputCols.map((col) => ({
        rowId: row.id,
        colKey: col.colKey,
        value: 2 + ((row.id * 7 + col.colKey.charCodeAt(0) * 3 + offset * 5) % 18),
      })),
    );
    await call('/reports/entries', {
      method: 'POST',
      token: adminToken,
      body: { templateId: template.id, entryDate, values },
    });
    saved += values.length;
  }
  log(`+ ${saved} ô số liệu trong 5 ngày cho ${template.departmentName}`);
}

async function main(): Promise<void> {
  console.log('\n▸ Dữ liệu mẫu QLBS (chỉ dùng cho môi trường thử nghiệm)\n');
  const adminToken = await login(ADMIN.username, ADMIN.password);
  log(`Đã đăng nhập ${ADMIN.username}`);

  const ctx = await ensureUsers(adminToken);

  const departments = await call<{ id: number; code: string; name: string }[]>('/departments/options', {
    token: adminToken,
  });
  const department = departments.find((d) => d.code === 'KPK') ?? departments[0];

  const requesters: Signer = { token: ctx.requesterToken, fullName: ctx.requester.fullName };
  const khtb: Signer = { token: ctx.khtbToken, fullName: ctx.khtb.fullName };
  const finance: Signer = { token: ctx.financeToken, fullName: ctx.finance.fullName };
  const shared = {
    requester: ctx.requester,
    departmentId: department.id,
    departmentName: department.name,
    requesters,
    khtb,
    finance,
  };

  const existing = await call<{ total: number }>('/hsba/requests?pageSize=1', { token: adminToken });
  if (existing.total > 0) {
    log(`= Đã có ${existing.total} phiếu sửa HSBA — giữ nguyên, chỉ bổ sung số liệu báo cáo`);
  } else {
    await createRequest(
      adminToken,
      {
        patientName: 'Nguyễn Thị Hồng Ánh',
        year: '1985',
        gender: 'Nữ',
        maKcb: 'KCB-2609-001',
        maTheBhyt: 'DN4791234567890',
        reason: 'Nhập sai ngày ra viện do hồ sơ giấy chưa khớp với phần mềm HIS',
        content: 'Sửa ngày ra viện từ 12/09/2026 thành 15/09/2026; giữ nguyên chẩn đoán.',
        amount: 1_250_000,
        enter: '2026-09-08',
        leave: '2026-09-15',
        priority: 'HIGH',
      },
      shared,
      0,
    );
    await createRequest(
      adminToken,
      {
        patientName: 'Trần Văn Hải',
        year: '1972',
        gender: 'Nam',
        maKcb: 'KCB-2609-014',
        maTheBhyt: 'DN4799876543210',
        reason: 'Sai mã thẻ BHYT khi nhập viện, ảnh hưởng giám định',
        content: 'Sửa mã thẻ BHYT từ DN4799876543210 thành DN47998765 43210 (đúng tuyến).',
        amount: 4_680_000,
        enter: '2026-09-10',
        leave: '2026-09-19',
      },
      shared,
      1,
    );
    await createRequest(
      adminToken,
      {
        patientName: 'Phạm Thị Thu',
        year: '1990',
        gender: 'Nữ',
        maKcb: 'KCB-2609-027',
        maTheBhyt: 'GD4791234500001',
        reason: 'Chưa hủy thanh toán gói dịch vụ đã hoàn trả cho người bệnh',
        content: 'Hủy thanh toán công khám và tiền giường ngày 20/09/2026 đã hoàn tiền mặt.',
        amount: 890_000,
        enter: '2026-09-18',
        leave: '2026-09-22',
      },
      shared,
      2,
    );
    await createRequest(
      adminToken,
      {
        patientName: 'Đỗ Minh Quân',
        year: '1968',
        gender: 'Nam',
        maKcb: 'KCB-2609-033',
        maTheBhyt: 'HT4791234567002',
        reason: 'Điều chỉnh chẩn đoán theo kết quả hội chẩn',
        content: 'Đổi chẩn đoán chính thành “Viêm ruột thừa cấp” và bổ sung mã ICD-10 K35.8.',
        amount: 3_150_000,
        enter: '2026-09-12',
        leave: '2026-09-17',
      },
      shared,
      3,
    );

    // Một phiếu bị trả lại để thấy rõ luồng xử lý lại
    const returned = await createRequest(
      adminToken,
      {
        patientName: 'Vũ Thị Mai',
        year: '1995',
        gender: 'Nữ',
        maKcb: 'KCB-2609-045',
        maTheBhyt: 'DN4791234599999',
        reason: 'Ghi nhầm khoa điều trị',
        content: 'Sửa khoa điều trị từ Khoa Nội tổng hợp thành Khoa Phẫu thuật - Gây mê hồi sức.',
        amount: 0,
        enter: '2026-09-20',
        leave: '2026-09-24',
      },
      shared,
      1,
    );
    await call(`/hsba/requests/${returned.id}/return`, {
      method: 'POST',
      token: khtb.token,
      body: { reason: 'Nội dung sửa chưa khớp với hồ sơ giấy, đề nghị rà soát lại ngày vào viện' },
    });
    log('- Đã trả lại phiếu ' + returned.code);
  }

  await createReportEntries(adminToken);

  console.log('\n✅ Xong. Đăng nhập thử:');
  console.log(`   admin / ${ADMIN.password}       — quản trị toàn hệ thống`);
  console.log(`   bs.minh / ${DEMO_PASSWORD}      — bác sĩ đề nghị (chỉ thấy dữ liệu của mình)`);
  console.log(`   khtb.lan / ${DEMO_PASSWORD}     — duyệt TB.KHTH`);
  console.log(`   tc.hoa / ${DEMO_PASSWORD}       — tài chính xác nhận hủy thanh toán\n`);
}

main().catch((err: unknown) => {
  console.error('\n✖ Lỗi tạo dữ liệu mẫu:', (err as Error).message, '\n');
  process.exitCode = 1;
});
