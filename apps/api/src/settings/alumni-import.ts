import { BadRequestException, Body, Controller, Module, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional } from 'class-validator';
import { BatchStatus, DeliveryType, RegistrationStatus, Role } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';

export class ImportAlumniDto {
  /** Baris mentah dari CSV/Excel (dipetakan fleksibel di server). */
  @IsArray()
  rows!: Array<Record<string, unknown>>;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  updateExisting?: boolean;
}

type RowAction = 'created' | 'updated' | 'skipped' | 'error';
type RowResult = {
  row: number;
  name: string;
  phone: string;
  program?: string;
  tanggal?: string;
  action: RowAction;
  message?: string;
};

const digits = (s: string) => s.replace(/\D+/g, '');
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Terima ISO (YYYY-MM-DD), DD/MM/YYYY, DD-MM-YYYY, atau objek Date. */
function parseDate(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = str(v);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (dmy) {
    const yy = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return new Date(yy, Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('alumni-import')
export class AlumniImportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async import(@Body() dto: ImportAlumniDto, @CurrentUser() me: AuthUser) {
    const rows = dto.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('Tidak ada baris data untuk diimpor.');
    }
    if (rows.length > 5000) {
      throw new BadRequestException('Maksimal 5.000 baris per proses impor. Pecah file Anda.');
    }

    // Peta peserta & kelas yang sudah ada (migrasi skala sedang)
    const existingParticipants = await this.prisma.participant.findMany({
      select: { id: true, name: true, email: true, phone: true, company: true, position: true, notes: true },
    });
    const byPhone = new Map(existingParticipants.map((p) => [digits(p.phone), p]));
    const byEmail = new Map(
      existingParticipants.filter((p) => p.email).map((p) => [String(p.email).toLowerCase(), p]),
    );
    const existingClasses = await this.prisma.programBatch.findMany({
      select: { id: true, batchName: true, startDate: true },
    });
    const classKey = (name: string, d: Date) => `${name.toLowerCase()}|${dayKey(d)}`;
    const classMap = new Map(existingClasses.map((c) => [classKey(c.batchName, c.startDate), c]));

    // Peta Judul Materi (program yang sudah pernah diikuti → jadi materi bila belum ada)
    const existingMaterials = await this.prisma.material.findMany({ select: { id: true, title: true } });
    const materialMap = new Map(existingMaterials.map((m) => [m.title.toLowerCase(), m]));

    const results: RowResult[] = [];
    const seenEnroll = new Set<string>();
    let participantsCreated = 0;
    let participantsUpdated = 0;
    let participantsSkipped = 0;
    let enrollmentsAdded = 0;
    let enrollmentsSkipped = 0;
    let classesCreated = 0;
    let materialsCreated = 0;
    let errors = 0;

    // ---- Kelompokkan baris per ORANG (kunci: telepon → email → nama+perusahaan) ----
    type Person = {
      key: string;
      name: string;
      phone: string;
      email: string;
      company: string | null;
      position: string | null;
      rows: Array<{ row: number; program: string; tanggal: Date | null; tanggalRaw: string; lokasi: string; kota: string }>;
    };
    const people = new Map<string, Person>();
    const personOrder: Person[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNo = i + 2;
      const r = rows[i] ?? {};
      const name = str(r.name);
      const phone = str(r.phone);
      const email = str(r.email).toLowerCase();
      const company = str(r.company) || null;
      const position = str(r.position) || null;
      const program = str(r.program);
      const tanggalRaw = str(r.tanggal);
      const lokasi = str(r.lokasi);
      const kota = str(r.kota);

      const pushError = (msg: string) => {
        errors++;
        results.push({ row: rowNo, name, phone, program: program || undefined, tanggal: tanggalRaw || undefined, action: 'error', message: msg });
      };

      if (name.length < 2) {
        pushError('Nama wajib diisi (min. 2 karakter).');
        continue;
      }
      if (digits(phone).length < 6) {
        pushError('Nomor telepon wajib/valid (min. 6 angka).');
        continue;
      }
      if (email && !EMAIL_RE.test(email)) {
        pushError('Format email tidak valid.');
        continue;
      }

      let tanggal: Date | null = null;
      if (program) {
        if (!tanggalRaw) {
          pushError('Tanggal wajib diisi bila kolom Program diisi.');
          continue;
        }
        tanggal = parseDate(r.tanggal);
        if (!tanggal) {
          pushError('Format tanggal tidak dikenali (gunakan YYYY-MM-DD atau DD/MM/YYYY).');
          continue;
        }
      }

      const key = digits(phone) ? `p:${digits(phone)}` : email ? `e:${email}` : `n:${name.toLowerCase()}|${(company ?? '').toLowerCase()}`;
      let person = people.get(key);
      if (!person) {
        person = { key, name, phone, email, company, position, rows: [] };
        people.set(key, person);
        personOrder.push(person);
      }
      person.rows.push({ row: rowNo, program, tanggal, tanggalRaw, lokasi, kota });
    }

    // ---- Proses per orang (gabungkan) ----
    for (const person of personOrder) {
      const normPhone = digits(person.phone);
      const match = byPhone.get(normPhone) ?? (person.email ? byEmail.get(person.email) : undefined);

      let participantId: string;
      let action: RowAction;
      if (match) {
        if (dto.updateExisting) {
          if (!dto.dryRun) {
            const updated = await this.prisma.participant.update({
              where: { id: match.id },
              data: {
                name: person.name,
                phone: person.phone,
                email: person.email || match.email,
                company: person.company ?? match.company,
                position: person.position ?? match.position,
              },
            });
            byPhone.set(normPhone, updated);
            if (person.email) byEmail.set(person.email, updated);
          }
          participantsUpdated++;
          action = 'updated';
        } else {
          participantsSkipped++;
          action = 'skipped';
        }
        participantId = match.id;
      } else {
        if (!dto.dryRun) {
          const created = await this.prisma.participant.create({
            data: {
              name: person.name,
              phone: person.phone,
              email: person.email || null,
              company: person.company,
              position: person.position,
            },
          });
          participantId = created.id;
          byPhone.set(normPhone, created);
          if (person.email) byEmail.set(person.email, created);
        } else {
          participantId = 'dry-run';
        }
        participantsCreated++;
        action = 'created';
      }

      for (const h of person.rows) {
        let message =
          action === 'created'
            ? 'Peserta dibuat'
            : action === 'updated'
              ? 'Peserta diperbarui'
              : 'Peserta sudah ada (dilewati)';

        if (h.program && h.tanggal) {
          const ck = classKey(h.program, h.tanggal);
          let cls = classMap.get(ck);
          let classIsNew = false;
          if (!cls) {
            classIsNew = true;
            // Pastikan Judul Materi ada (program yang diikuti → materi)
            let material = materialMap.get(h.program.toLowerCase());
            if (!material) {
              materialsCreated++;
              if (!dto.dryRun) {
                const createdMaterial = await this.prisma.material.create({
                  data: { title: h.program, category: 'Migrasi', isActive: true },
                  select: { id: true, title: true },
                });
                materialMap.set(h.program.toLowerCase(), createdMaterial);
                material = createdMaterial;
              } else {
                material = { id: 'dry-run', title: h.program };
                materialMap.set(h.program.toLowerCase(), material);
              }
            }
            if (!dto.dryRun) {
              const createdClass = await this.prisma.programBatch.create({
                data: {
                  batchName: h.program,
                  materialId: material?.id !== 'dry-run' ? material?.id : null,
                  category: 'Migrasi',
                  description: `Data migrasi alumni — lokasi: ${[h.lokasi, h.kota].filter(Boolean).join(', ') || '-'}`,
                  startDate: h.tanggal,
                  endDate: h.tanggal,
                  location: [h.lokasi, h.kota].filter(Boolean).join(', ') || null,
                  status: BatchStatus.COMPLETED,
                  deliveryType: DeliveryType.REGULAR,
                  pricePerPax: 0,
                },
                select: { id: true, batchName: true, startDate: true },
              });
              classMap.set(ck, createdClass);
              cls = createdClass;
            } else {
              cls = { id: 'dry-run', batchName: h.program, startDate: h.tanggal };
              classMap.set(ck, cls);
            }
            classesCreated++;
          }

          let enrollmentExists = false;
          const ekey = `${ck}|${person.key}`;
          if (dto.dryRun) {
            enrollmentExists = seenEnroll.has(ekey);
            seenEnroll.add(ekey);
          } else if (cls && cls.id !== 'dry-run' && participantId !== 'dry-run') {
            const found = await this.prisma.batchParticipant.findUnique({
              where: { batchId_participantId: { batchId: cls.id, participantId } },
            });
            enrollmentExists = !!found;
            if (!found) {
              await this.prisma.batchParticipant.create({
                data: { batchId: cls.id, participantId, registrationStatus: RegistrationStatus.COMPLETED },
              });
            }
          }

          if (enrollmentExists) {
            enrollmentsSkipped++;
            message += ` · riwayat "${h.program}" sudah ada (dilewati)`;
          } else {
            enrollmentsAdded++;
            message += ` · riwayat "${h.program}" ${classIsNew ? 'ditambahkan (kelas baru)' : 'ditambahkan'}`;
          }
        } else {
          message += ' · tanpa riwayat program';
        }

        results.push({
          row: h.row,
          name: person.name,
          phone: person.phone,
          program: h.program || undefined,
          tanggal: h.tanggalRaw || undefined,
          action,
          message,
        });
      }
    }

    if (!dto.dryRun) {
      await this.audit.log(
        me.sub,
        'alumni.import',
        `Impor alumni: ${participantsCreated} peserta baru, ${participantsUpdated} diperbarui, ${participantsSkipped} dilewati, ` +
          `${enrollmentsAdded} riwayat pelatihan ditambahkan, ${classesCreated} kelas baru, ${materialsCreated} judul materi baru, ${errors} error`,
      );
    }

    return {
      dryRun: !!dto.dryRun,
      total: rows.length,
      participantsCreated,
      participantsUpdated,
      participantsSkipped,
      enrollmentsAdded,
      enrollmentsSkipped,
      classesCreated,
      materialsCreated,
      errors,
      results,
    };
  }
}

@Module({ controllers: [AlumniImportController] })
export class AlumniImportModule {}
