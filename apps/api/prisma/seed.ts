import {
  PrismaClient,
  Role,
  LeadSource,
  BatchStatus,
  RegistrationStatus,
  ExpenseCategory,
  PaymentStatus,
  DeliveryType,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/**
 * Sandi akun demo TIDAK ditulis di kode (repo ini publik).
 * Set `SEED_PASSWORD` sebelum menjalankan seed, atau biarkan kosong
 * agar sandi acak dibuat dan ditampilkan sekali di terminal.
 */
function resolveSeedPassword(): { password: string; generated: boolean } {
  const fromEnv = process.env.SEED_PASSWORD?.trim();
  if (fromEnv && fromEnv.length >= 8) return { password: fromEnv, generated: false };
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 14; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return { password: out, generated: true };
}

/** Tolak seed ke database non-lokal kecuali disetujui eksplisit. */
function assertTargetAllowed() {
  const url = process.env.DATABASE_URL ?? '';
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
  if (!isLocal && process.env.ALLOW_REMOTE_SEED !== '1') {
    console.error(
      '\n[seed] DATABASE_URL menunjuk ke server NON-lokal.\n' +
        '       Seed akan MENAMBAH/MENGUBAH data di sana.\n' +
        '       Jalankan ulang dengan ALLOW_REMOTE_SEED=1 bila memang disengaja.\n' +
        '       Untuk mengisi database cloud dari data lokal, pakai scripts/db-import.sh.\n',
    );
    process.exit(1);
  }
}

/**
 * Dataset demo: 1 materi = 1 kelas lampau (sumber riwayat) + 1 kelas akan datang (target marketing).
 * 8 alumni dengan sebaran materi berbeda — TIDAK semua materi diikuti semua alumni,
 * sehingga bisa dilihat prospek per level (prasyarat: sudah menuntaskan level sebelumnya).
 */
async function main() {
  assertTargetAllowed();
  const { password: seedPassword, generated } = resolveSeedPassword();
  const password = await argon2.hash(seedPassword, { type: argon2.argon2id });

  const users: Array<{ name: string; email: string; role: Role }> = [
    { name: 'Super Administrator', email: 'superadmin@intimakna.id', role: Role.SUPER_ADMIN },
    { name: 'Dewi Lestari', email: 'management@intimakna.id', role: Role.MANAGEMENT },
    { name: 'Rizky Pratama', email: 'sales@intimakna.id', role: Role.SALES_MARKETING },
    { name: 'Sari Wulandari', email: 'admin@intimakna.id', role: Role.ADMIN_TRAINING },
    { name: 'Andi Saputra', email: 'support@intimakna.id', role: Role.TRAINING_SUPPORT },
    { name: 'Maya Anggraini', email: 'finance@intimakna.id', role: Role.FINANCE },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash: password, role: u.role },
    });
  }
  const salesId = (await prisma.user.findUnique({ where: { email: 'sales@intimakna.id' } }))!.id;

  // ---------- Learning Path (Judul Materi per level) ----------
  const pathSeed: Array<{ level: number; title: string; category: string; price: number }> = [
    { level: 1, title: 'Leadership Inside-Out', category: 'Leadership', price: 4000000 },
    { level: 2, title: 'Accessing Personal Genius', category: 'Personal Development', price: 4500000 },
    { level: 3, title: 'Neurosemantics Practitioner', category: 'Komunikasi', price: 5500000 },
    { level: 4, title: 'Neurosemantics Master Practitioner', category: 'Komunikasi', price: 6500000 },
    { level: 5, title: 'Neurosemantics Training for Trainer', category: 'TOT', price: 7500000 },
  ];
  const materials: Array<{ id: string; level: number; title: string; price: number }> = [];
  for (const s of pathSeed) {
    let m = await prisma.material.findFirst({ where: { title: { equals: s.title, mode: 'insensitive' } } });
    if (!m) {
      m = await prisma.material.create({
        data: { title: s.title, category: s.category, levelNumber: s.level, orderInLevel: 0 },
      });
    } else if (m.levelNumber === null) {
      m = await prisma.material.update({ where: { id: m.id }, data: { levelNumber: s.level } });
    }
    materials.push({ id: m.id, level: s.level, title: s.title, price: s.price });
  }
  const matByLevel = new Map(materials.map((m) => [m.level, m]));

  // ---------- Kelas Reguler: 1 lampau (riwayat) + 1 akan datang (target) per materi ----------
  const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);
  const daysAhead = (n: number) => new Date(Date.now() + n * 864e5);

  const classRows = new Map<string, { id: string; level: number; upcoming: boolean }>();
  for (const m of materials) {
    const pastName = `Lv${m.level} ${m.title.split(' ')[0].toUpperCase()}-GENAP 2025`;
    const nextName = `Lv${m.level} ${m.title.split(' ')[0].toUpperCase()}-GANJIL 2026`;
    const past = await ensureClass(prisma, {
      batchName: pastName,
      materialId: m.id,
      category: m.title,
      pricePerPax: m.price,
      startDate: daysAgo(120 - m.level * 10),
      endDate: daysAgo(118 - m.level * 10),
      status: BatchStatus.COMPLETED,
      location: ['Jakarta', 'Bandung', 'Yogyakarta'][m.level % 3],
    });
    const next = await ensureClass(prisma, {
      batchName: nextName,
      materialId: m.id,
      category: m.title,
      pricePerPax: m.price,
      startDate: daysAhead(30 + m.level * 12),
      endDate: daysAhead(32 + m.level * 12),
      status: BatchStatus.PLANNED,
      location: ['Jakarta', 'Bandung', 'Yogyakarta'][(m.level + 1) % 3],
    });
    classRows.set(`${m.level}-past`, { id: past, level: m.level, upcoming: false });
    classRows.set(`${m.level}-next`, { id: next, level: m.level, upcoming: true });
  }

  // ---------- 8 Alumni dengan sebaran materi berbeda ----------
  const alumni: Array<{
    name: string; company: string; city: string; position: string; phone: string; email: string; levels: number[];
  }> = [
    { name: 'Rangga Wijaya', company: 'PT Sinar Abadi', city: 'Jakarta', position: 'HR Manager', phone: '0811-0000-0001', email: 'rangga@sinarabadi.co.id', levels: [1, 2, 3, 4] },
    { name: 'Maya Kusuma', company: 'Bank Cakrawala', city: 'Jakarta', position: 'Training Officer', phone: '0811-0000-0002', email: 'maya.k@cakrawala.co.id', levels: [1, 2, 3] },
    { name: 'Fajar Nugroho', company: 'PT Ritel Nusantara', city: 'Bandung', position: 'Store Manager', phone: '0811-0000-0003', email: 'fajar@ritelnusantara.co.id', levels: [1, 2] },
    { name: 'Larasati Putri', company: 'CV Bina Karya', city: 'Semarang', position: 'Supervisor', phone: '0811-0000-0004', email: 'laras@binakarya.co.id', levels: [1] },
    { name: 'Adit Prasetya', company: 'PT Logistik Andalan', city: 'Surabaya', position: 'Team Lead', phone: '0811-0000-0005', email: 'adit@logistikandalan.co.id', levels: [2] },
    { name: 'Sinta Marlina', company: 'RS Sehat Sentosa', city: 'Yogyakarta', position: 'HRD Staff', phone: '0811-0000-0006', email: 'sinta@sehatsentosa.co.id', levels: [1, 3] },
    { name: 'Bayu Anggara', company: 'PT Energi Prima', city: 'Balikpapan', position: 'Trainer Internal', phone: '0811-0000-0007', email: 'bayu@energiprima.co.id', levels: [2, 3, 4, 5] },
    { name: 'Nadia Rahma', company: 'Universitas Harapan', city: 'Malang', position: 'Dosen', phone: '0811-0000-0008', email: 'nadia@uharapan.ac.id', levels: [1, 3] },
  ];

  for (const a of alumni) {
    const participant = await prisma.participant.upsert({
      where: { phone: a.phone },
      update: { company: a.company, position: a.position, email: a.email },
      create: {
        name: a.name,
        phone: a.phone,
        email: a.email,
        company: a.company,
        position: a.position,
        notes: `Kota: ${a.city}`,
      },
    });

    for (const level of a.levels) {
      const mat = matByLevel.get(level)!;
      const cls = classRows.get(`${level}-past`)!;
      await prisma.batchParticipant.upsert({
        where: { batchId_participantId: { batchId: cls.id, participantId: participant.id } },
        update: { registrationStatus: RegistrationStatus.COMPLETED },
        create: { batchId: cls.id, participantId: participant.id, registrationStatus: RegistrationStatus.COMPLETED },
      });
      await prisma.batchRevenue.upsert({
        where: { batchId_participantId: { batchId: cls.id, participantId: participant.id } },
        update: { totalPaid: mat.price, paymentStatus: PaymentStatus.PAID },
        create: {
          batchId: cls.id,
          participantId: participant.id,
          totalAmount: mat.price,
          totalPaid: mat.price,
          paymentStatus: PaymentStatus.PAID,
        },
      });
    }
  }

  // ---------- Pengeluaran contoh (kelas lampau) ----------
  if ((await prisma.batchExpense.count()) === 0) {
    const expenses: Array<{ level: number; category: ExpenseCategory; amount: number; desc: string }> = [
      { level: 1, category: ExpenseCategory.VENUE, amount: 6000000, desc: 'Sewa ruang kelas 3 hari' },
      { level: 1, category: ExpenseCategory.CATERING, amount: 3000000, desc: 'Konsumsi peserta' },
      { level: 2, category: ExpenseCategory.TRAINER_FEE, amount: 12000000, desc: 'Fee trainer utama' },
      { level: 3, category: ExpenseCategory.MODUL_ATK, amount: 2500000, desc: 'Cetak modul & ATK' },
      { level: 5, category: ExpenseCategory.TRAINER_FEE, amount: 18000000, desc: 'Fee master trainer' },
    ];
    for (const ex of expenses) {
      const cls = classRows.get(`${ex.level}-past`)!;
      await prisma.batchExpense.create({
        data: { batchId: cls.id, category: ex.category, amount: ex.amount, description: ex.desc },
      });
    }
  }

  // ---------- Beberapa lead prospek untuk kelas berikutnya ----------
  const stages = await prisma.leadStage.findMany({ orderBy: { orderIndex: 'asc' } });
  const stageOpen2 = stages[1]?.id ?? stages[0]?.id;
  const leadSeed: Array<{ name: string; company: string; phone: string; level: number }> = [
    { name: 'Hendra Wijaya', company: 'PT Mitra Retail', phone: '0812-9000-0001', level: 1 },
    { name: 'Ratna Sari', company: 'Bank Cakrawala', phone: '0812-9000-0002', level: 4 },
    { name: 'Yusuf Maulana', company: 'PT Energi Prima', phone: '0812-9000-0003', level: 5 },
  ];
  for (const l of leadSeed) {
    const exists = await prisma.lead.findFirst({ where: { phone: l.phone } });
    if (exists) continue;
    const cls = classRows.get(`${l.level}-next`)!;
    await prisma.lead.create({
      data: {
        source: LeadSource.WHATSAPP,
        name: l.name,
        company: l.company,
        phone: l.phone,
        stageId: stageOpen2,
        assignedToId: salesId,
        interestBatchId: cls.id,
      },
    });
  }

  // ---------- Checklist Default & checklist per kelas ----------
  const defaultItems: Array<{ title: string; note?: string }> = [
    { title: 'Sertifikat Peserta' },
    { title: 'Materi print/softcopy' },
    { title: 'Snack Cemilan' },
    { title: 'Snack Coffee Break Plan', note: '2x coffee break' },
    { title: 'Lunch Break Menu' },
  ];
  if ((await prisma.requirementTemplate.count()) === 0) {
    for (let i = 0; i < defaultItems.length; i++) {
      await prisma.requirementTemplate.create({
        data: { title: defaultItems[i].title, note: defaultItems[i].note, orderIndex: i },
      });
    }
  }
  const templates = await prisma.requirementTemplate.findMany({ orderBy: { orderIndex: 'asc' } });
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@intimakna.id' } });

  for (const [, cls] of classRows) {
    const existing = await prisma.batchRequirement.count({ where: { batchId: cls.id } });
    if (existing > 0) continue;
    const doneCount = cls.upcoming ? 2 : 5; // kelas akan datang: sebagian belum; kelas lampau: lengkap
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      const isDone = i < doneCount;
      await prisma.batchRequirement.create({
        data: {
          batchId: cls.id,
          category: 'DEFAULT',
          title: t.title,
          note: t.note,
          orderIndex: i,
          isDone,
          doneAt: isDone ? new Date(Date.now() - 5 * 864e5) : null,
          doneById: isDone ? adminUser?.id ?? null : null,
        },
      });
    }
  }

  // Contoh item Custom pada satu kelas (mis. kelas Lv4 berikutnya)
  const lv4 = materials.find((m) => m.level === 4);
  if (lv4) {
    const cls = classRows.get('4-next')!;
    const hasCustom = await prisma.batchRequirement.count({ where: { batchId: cls.id, category: 'CUSTOM' } });
    if (hasCustom === 0) {
      await prisma.batchRequirement.createMany({
        data: [
          { batchId: cls.id, category: 'CUSTOM', title: 'Spanduk Backdrop', note: 'ukuran 3x2 m', orderIndex: 0 },
          { batchId: cls.id, category: 'CUSTOM', title: 'Operator Zoom', note: 'untuk peserta hybrid', orderIndex: 1 },
        ],
      });
    }
  }

  console.log('Checklist default:', defaultItems.length, 'item | Kelas diberi checklist:', classRows.size);

  console.log('Seed selesai (dataset demo).');
  if (generated) {
    console.log(`Sandi akun demo (dibuat otomatis, catat sekarang): ${seedPassword}`);
  } else {
    console.log('Sandi akun demo: sesuai nilai SEED_PASSWORD yang Anda set.');
  }
  console.log('Akun:');
  for (const u of users) console.log(`  - ${u.email} (${u.role})`);
  console.log('Learning Path:', pathSeed.map((p) => `Lv${p.level} ${p.title}`).join(' → '));
  console.log('Alumni:', alumni.length, '| Kelas:', classRows.size);
}

async function ensureClass(
  db: PrismaClient,
  data: {
    batchName: string; materialId: string; category: string; pricePerPax: number;
    startDate: Date; endDate: Date; status: BatchStatus; location: string;
  },
): Promise<string> {
  const existing = await db.programBatch.findFirst({ where: { batchName: data.batchName } });
  if (existing) {
    await db.programBatch.updateMany({
      where: { id: existing.id, materialId: null },
      data: { materialId: data.materialId },
    });
    return existing.id;
  }
  const created = await db.programBatch.create({
    data: {
      batchName: data.batchName,
      materialId: data.materialId,
      category: data.category,
      pricePerPax: data.pricePerPax,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      location: data.location,
      deliveryType: DeliveryType.REGULAR,
    },
  });
  return created.id;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
