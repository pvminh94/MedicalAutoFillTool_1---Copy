/**
 * Tạo dữ liệu mẫu để xem giao diện: người dùng theo vai trò, phiếu sửa HSBA ở mọi
 * trạng thái (kể cả phiếu bị trả lại) và số liệu báo cáo của một khoa trong vài ngày.
 *
 * Toàn bộ dữ liệu đều đi qua API thật (không ghi thẳng CSDL) nên đúng nghiệp vụ:
 * phiếu được ký lần lượt bởi người đề nghị → TB.KHTH → Tài chính.
 *
 *   npm run db:demo
 *
 * CẢNH BÁO: chỉ dùng cho môi trường thử nghiệm.
 */
import 'dotenv/config';

const BASE = process.env.DEMO_API_BASE ?? `http://127.0.0.1:${process.env.PORT ?? 4000}/api`;
const ADMIN_USER = process.env.DEMO_ADMIN_USER ?? process.env.SEED_ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.DEMO_ADMIN_PASS ?? process.env.SEED_ADMIN_PASS ?? 'Admin@123';
const DEMO_PASSWORD = '123456';

interface ApiResult<T> {
  success: boolean;
  data: T;
  message?: string | string[];
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
  let payload: ApiResult<T> | null = null;
  try {
    payload = JSON.parse(text) as ApiResult<T>;
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message = payload?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(
      `${options.method ?? 'GET'} ${path} → ${Array.isArray(message) ? message.join('; ') : message}`,
    );
  }
  return (payload as ApiResult<T>).data;
}

const log = (...args: unknown[]): void => console.log('  ', ...args);

async function login(username: string, password: string): Promise<string> {
  const result = await call<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  return result.accessToken;
}

interface Option {
  id: number;
  code?: string;
  name?: string;
  fullName?: string;
  username?: string;
  departmentId?: number | null;
}

async function main(): Promise<void> {
  console.log('\n▸ Dữ liệu mẫu QLBS (chỉ dùng cho môi trường thử nghiệm)\n');

  const adminToken = await login(ADMIN_USER, ADMIN_PASS);
  log(`đã đăng nhập ${ADMIN_USER}`);

  const departments = await call<Option[]>('/departments/options', { token: adminToken });
  const surgery =
    departments.find((d) => d.code === 'KPK') ??
    departments.find((d) => d.code === 'KNOI') ??
    departments[0];
  const khth = departments.find((d) => d.code === 'KHTB') ?? departments[0];
  if (!surgery || !khth) throw new Error('Chưa có khoa phòng — hãy chạy npm run db:seed trước');

  /* ------------------------------------------------------- 1. Người dùng mẫu */
  const usersPage = await call<{ items: (Option & { id: number; username: string })[] }>(
    '/users?pageSize=200',
    { token: adminToken },
  );
  const byUsername = new Map(usersPage.items.map((u) => [u.username, u]));

  const specs = [
    {
      username: 'bs.minh',
      fullName: 'Nguyễn Văn Minh',
      title: 'Bác sĩ điều trị',
      departmentId: surgery.id,
      roleCodes: ['NHAP_LIEU'],
      phone: '0900000001',
    },
    {
      username: 'khtb.lan',
      fullName: 'Trần Thị Lan',
      title: 'Chuyên viên KHTH',
      departmentId: khth.id,
      roleCodes: ['KHTB'],
      phone: '0900000002',
    },
    {
      username: 'tc.hoa',
      fullName: 'Lê Thị Hoa',
      title: 'Kế toán viên',
      departmentId: khth.id,
      roleCodes: ['TAI_CHINH'],
      phone: '0900000003',
    },
    {
      username: 'tk.nam',
      fullName: 'Phạm Hoàng Nam',
      title: 'Trưởng khoa',
      departmentId: surgery.id,
      roleCodes: ['TRUONG_KHOA'],
      phone: '0900000004',
    },
  ];

  for (const spec of specs) {
    if (byUsername.has(spec.username)) {
      log(`= đã có người dùng ${spec.username}`);
      continue;
    }
    const created = await call<Option & { id: number; username: string }>('/users', {
      method: 'POST',
      token: adminToken,
      body: { ...spec, password: DEMO_PASSWORD },
    });
    byUsername.set(created.username, created);
    log(`+ người dùng ${created.fullName} (${created.username}) — vai trò ${spec.roleCodes.join(', ')}`);
  }

  const requester = byUsername.get('bs.minh');
  if (!requester) throw new Error('Không tạo được người dùng mẫu bs.minh');
  const requesterToken = await login('bs.minh', DEMO_PASSWORD);
  const khtbToken = await login('khtb.lan', DEMO_PASSWORD);
  const financeToken = await login('tc.hoa', DEMO_PASSWORD);

  /* --------------------------------------------------- 2. Phiếu sửa HSBA mẫu */
  const existing = await call<{ total: number }>('/hsba/requests?pageSize=1', { token: adminToken });
  if (existing.total > 0) {
    log(`= đã có ${existing.total} phiếu sửa HSBA — bỏ qua phần phiếu`);
  } else {
    const base = {
      requesterId: requester.id,
      requesterName: requester.fullName,
      requesterTitle: 'Bác sĩ điều trị',
      departmentId: surgery.id,
      departmentName: surgery.name ?? '',
    };

    const sign = async (id: number, token: string): Promise<void> => {
      await call(`/hsba/requests/${id}/sign`, { method: 'POST', token, body: { note: '' } });
    };

    const cases: {
      patient: string;
      year: string;
      gender: string;
      maKcb: string;
      maTheBhyt: string;
      reason: string;
      content: string;
      amount: string;
      enter: string;
      leave: string;
      priority: string;
      steps: number;
      returned?: boolean;
    }[] = [
      {
        patient: 'Nguyễn Thị Hồng Ánh',
        year: '1985',
        gender: 'Nữ',
        maKcb: 'KCB-2601-001',
        maTheBhyt: 'DN4791234567890',
        reason: 'Ngày ra viện trên phần mềm chưa khớp hồ sơ giấy',
        content: 'Sửa ngày ra viện từ 12/09/2026 thành 15/09/2026, giữ nguyên chẩn đoán.',
        amount: '1250000',
        enter: '2026-09-08',
        leave: '2026-09-15',
        priority: 'HIGH',
        steps: 0,
      },
      {
        patient: 'Trần Văn Hải',
        year: '1972',
        gender: 'Nam',
        maKcb: 'KCB-2601-014',
        maTheBhyt: 'DN4799876543210',
        reason: 'Sai mã thẻ BHYT khi nhập viện, ảnh hưởng giám định',
        content: 'Sửa mã thẻ BHYT đúng tuyến, giữ nguyên các thông tin khác.',
        amount: '4680000',
        enter: '2026-09-10',
        leave: '2026-09-19',
        priority: 'NORMAL',
        steps: 1,
      },
      {
        patient: 'Phạm Thị Thu',
        year: '1990',
        gender: 'Nữ',
        maKcb: 'KCB-2601-027',
        maTheBhyt: 'GD4791234500001',
        reason: 'Đã hoàn tiền mặt nhưng chưa hủy thanh toán trên phần mềm',
        content: 'Hủy thanh toán công khám và tiền giường ngày 20/09/2026.',
        amount: '890000',
        enter: '2026-09-18',
        leave: '2026-09-22',
        priority: 'NORMAL',
        steps: 2,
      },
      {
        patient: 'Đỗ Minh Quân',
        year: '1968',
        gender: 'Nam',
        maKcb: 'KCB-2601-033',
        maTheBhyt: 'HT4791234567002',
        reason: 'Điều chỉnh chẩn đoán theo kết quả hội chẩn',
        content: 'Đổi chẩn đoán chính thành “Viêm ruột thừa cấp”, bổ sung mã ICD-10 K35.8.',
        amount: '3150000',
        enter: '2026-09-12',
        leave: '2026-09-17',
        priority: 'URGENT',
        steps: 3,
      },
      {
        patient: 'Vũ Thị Mai',
        year: '1995',
        gender: 'Nữ',
        maKcb: 'KCB-2601-045',
        maTheBhyt: 'DN4791234599999',
        reason: 'Ghi nhầm khoa điều trị',
        content: 'Sửa khoa điều trị sang Khoa Phẫu thuật - Gây mê hồi sức.',
        amount: '0',
        enter: '2026-09-20',
        leave: '2026-09-24',
        priority: 'LOW',
        steps: 1,
        returned: true,
      },
    ];

    const tokens = [requesterToken, khtbToken, financeToken];
    for (const item of cases) {
      const created = await call<{ id: number; code: string }>('/hsba/requests', {
        method: 'POST',
        token: adminToken,
        body: {
          ...base,
          patientName: item.patient,
          patientBirthYear: item.year,
          patientGender: item.gender,
          maKcb: item.maKcb,
          maTheBhyt: item.maTheBhyt,
          ngayVaoVien: item.enter,
          ngayRaVien: item.leave,
          doiTuong: 'BHYT',
          priority: item.priority,
          reason: item.reason,
          content: item.content,
          amount: item.amount,
          signNow: false,
        },
      });

      for (let i = 0; i < item.steps; i += 1) {
        const token = tokens[i];
        if (token) await sign(created.id, token);
      }

      if (item.returned) {
        await call(`/hsba/requests/${created.id}/return`, {
          method: 'POST',
          token: khtbToken,
          body: { reason: 'Nội dung sửa chưa khớp hồ sơ giấy, đề nghị rà soát lại ngày vào viện' },
        });
        log(`+ phiếu ${created.code} — ${item.patient} (bị trả lại, chờ sửa & gửi lại)`);
      } else {
        log(`+ phiếu ${created.code} — ${item.patient} (${item.steps}/3 bước ký)`);
      }
    }
  }

  /* --------------------------------------------------- 3. Số liệu báo cáo mẫu */
  const templates = await call<{ items: { id: number; code: string; departmentName: string }[] }>(
    '/reports/templates?pageSize=50',
    { token: adminToken },
  );
  const template = templates.items[0];
  if (!template) {
    log('! chưa có mẫu báo cáo nào — bỏ qua phần số liệu');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const grid = await call<{
      columns: { colKey: string; kind: string }[];
      sections: {
        rows: { id: number }[];
        blocks: { rows: { id: number }[] }[];
      }[];
    }>(`/reports/entries/grid?templateId=${template.id}&period=day&date=${today}`, { token: adminToken });

    const rows = (grid.sections ?? []).flatMap((s) => [
      ...(s.rows ?? []),
      ...(s.blocks ?? []).flatMap((b) => b.rows ?? []),
    ]);
    const inputCols = (grid.columns ?? []).filter((c) => c.kind === 'INPUT');

    if (rows.length === 0 || inputCols.length === 0) {
      log('! mẫu báo cáo chưa có dòng/cột nhập liệu — bỏ qua phần số liệu');
    } else {
      let cells = 0;
      for (let offset = 4; offset >= 0; offset -= 1) {
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
        cells += values.length;
      }
      log(`+ ${cells} ô số liệu trong 5 ngày cho ${template.departmentName}`);
    }
  }

  console.log('\n✅ Xong. Đăng nhập thử:');
  console.log(`   ${ADMIN_USER} / ${ADMIN_PASS}          — quản trị toàn hệ thống`);
  console.log(`   bs.minh / ${DEMO_PASSWORD}            — người đề nghị (chỉ thấy phiếu của mình)`);
  console.log(`   khtb.lan / ${DEMO_PASSWORD}           — duyệt TB.KHTH`);
  console.log(`   tc.hoa / ${DEMO_PASSWORD}             — tài chính xác nhận hủy thanh toán`);
  console.log(`   tk.nam / ${DEMO_PASSWORD}             — trưởng khoa (nhập số liệu báo cáo)\n`);
}

main().catch((err: unknown) => {
  console.error('\n✖ Lỗi tạo dữ liệu mẫu:', (err as Error).message);
  console.error('  (API phải đang chạy: npm run dev)\n');
  process.exitCode = 1;
});
