import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { BatchStatus, DeliveryType, Role } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';

export class CreateProgramDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(2)
  category!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  syllabus?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  standardPrice!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  inHousePrice?: number;
}

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  category?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  syllabus?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  inHousePrice?: number | null;
}

export class CreateBatchDto {
  @IsString()
  @MinLength(3)
  batchName!: string;

  /** Judul Materi (unit ajar) — Kelas Reguler = Judul Materi + Batch */
  @IsUUID()
  materialId!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  syllabus?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerPax?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  packagePrice?: number;
}

export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  batchName?: string;

  @IsOptional()
  @IsUUID()
  materialId?: string | null;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  syllabus?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsString()
  clientName?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerPax?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  packagePrice?: number | null;
}

const FINANCE_ROLES = [Role.FINANCE, Role.MANAGEMENT, Role.ADMIN_TRAINING];

@UseGuards(AuthGuard, RolesGuard)
@Controller('programs')
export class ProgramsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('paged') paged?: string,
  ) {
    const doPage = paged === '1';
    const take = Math.min(Number(limit) || 10, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const rows = await this.prisma.trainingProgram.findMany({
      orderBy: { createdAt: 'desc' },
      skip: doPage ? skip : undefined,
      take: doPage ? take : undefined,
    });
    const mapped = rows.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      description: p.description,
      syllabus: p.syllabus,
      standardPrice: Number(p.standardPrice),
      inHousePrice: p.inHousePrice != null ? Number(p.inHousePrice) : null,
    }));
    if (doPage) {
      const total = await this.prisma.trainingProgram.count();
      return { data: mapped, total, page: Math.max(Number(page) || 1, 1), limit: take };
    }
    return mapped;
  }

  @Roles(Role.ADMIN_TRAINING)
  @Post()
  async create(@Body() dto: CreateProgramDto, @CurrentUser() me: AuthUser) {
    const program = await this.prisma.trainingProgram.create({
      data: {
        title: dto.title,
        category: dto.category,
        description: dto.description,
        syllabus: dto.syllabus,
        inHousePrice: dto.inHousePrice,
        standardPrice: dto.standardPrice,
      },
    });
    await this.audit.log(me.sub, 'program.create', `Program baru: ${program.title}`);
    return { id: program.id, title: program.title, standardPrice: Number(program.standardPrice) };
  }

  @Roles(Role.ADMIN_TRAINING)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProgramDto, @CurrentUser() me: AuthUser) {
    const existing = await this.prisma.trainingProgram.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Program tidak ditemukan');
    const program = await this.prisma.trainingProgram.update({
      where: { id },
      data: {
        title: dto.title,
        category: dto.category,
        description: dto.description,
        syllabus: dto.syllabus,
        inHousePrice: dto.inHousePrice,
      },
    });
    await this.audit.log(me.sub, 'program.update', `Program ${existing.title} diperbarui`);
    return {
      id: program.id,
      title: program.title,
      category: program.category,
      description: program.description,
      syllabus: program.syllabus,
      standardPrice: Number(program.standardPrice),
      inHousePrice: program.inHousePrice != null ? Number(program.inHousePrice) : null,
    };
  }

  @Roles(Role.ADMIN_TRAINING)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    const program = await this.prisma.trainingProgram.findUnique({ where: { id } });
    if (!program) throw new NotFoundException('Program tidak ditemukan');
    const interestCount = await this.prisma.lead.count({ where: { interestProgramId: id } });
    if (interestCount > 0) {
      throw new BadRequestException(
        `Program "${program.title}" masih dijadikan minat ${interestCount} lead. Lepaskan dulu dari lead terkait.`,
      );
    }
    await this.prisma.trainingProgram.delete({ where: { id } });
    await this.audit.log(me.sub, 'program.delete', `Program dihapus: ${program.title}`);
    return { ok: true };
  }
}

@UseGuards(AuthGuard, RolesGuard)
@Controller('batches')
export class BatchesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async withFinance(b: {
    id: string;
    deliveryType: DeliveryType;
    packagePrice: unknown;
    packagePaid: unknown;
  }) {
    const [rev, exp] = await Promise.all([
      this.prisma.batchRevenue.aggregate({
        where: { batchId: b.id },
        _sum: { totalAmount: true, totalPaid: true },
      }),
      this.prisma.batchExpense.aggregate({ where: { batchId: b.id }, _sum: { amount: true } }),
    ]);
    const inHouse = b.deliveryType === 'IN_HOUSE';
    const revenue = inHouse ? Number(b.packagePrice ?? 0) : Number(rev._sum.totalAmount ?? 0);
    const paidTotal = inHouse ? Number(b.packagePaid ?? 0) : Number(rev._sum.totalPaid ?? 0);
    const expense = Number(exp._sum.amount ?? 0);
    return {
      revenue,
      paidTotal,
      expense,
      net: revenue - expense,
    };
  }

  @Get()
  async list(
    @CurrentUser() me: AuthUser,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('paged') paged?: string,
  ) {
    const doPage = paged === '1';
    const take = Math.min(Number(limit) || 10, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where = status ? { status: status as BatchStatus } : {};
    const rows = await this.prisma.programBatch.findMany({
      where,
      skip: doPage ? skip : undefined,
      take: doPage ? take : undefined,
      orderBy: { startDate: 'desc' },
      include: {
        material: { select: { id: true, title: true, levelNumber: true, category: true } },
        _count: { select: { participants: true } },
      },
    });
    const canSeeFinance = FINANCE_ROLES.includes(me.role as (typeof FINANCE_ROLES)[number]);

    // Ringkasan checklist persiapan per kelas
    const ids = rows.map((r) => r.id);
    const [reqTotals, reqDone] = await Promise.all([
      this.prisma.batchRequirement.groupBy({ by: ['batchId'], where: { batchId: { in: ids } }, _count: { _all: true } }),
      this.prisma.batchRequirement.groupBy({
        by: ['batchId'],
        where: { batchId: { in: ids }, isDone: true },
        _count: { _all: true },
      }),
    ]);
    const totalMap = new Map(reqTotals.map((x) => [x.batchId, x._count._all]));
    const doneMap = new Map(reqDone.map((x) => [x.batchId, x._count._all]));

    const out = [];
    for (const b of rows) {
      out.push({
        id: b.id,
        batchName: b.batchName,
        material: b.material,
        category: b.category,
        description: b.description,
        syllabus: b.syllabus,
        startDate: b.startDate,
        endDate: b.endDate,
        location: b.location,
        status: b.status,
        deliveryType: b.deliveryType,
        clientName: b.clientName,
        pricePerPax: b.pricePerPax != null ? Number(b.pricePerPax) : null,
        packagePrice: b.packagePrice != null ? Number(b.packagePrice) : null,
        packagePaid: Number(b.packagePaid),
        packagePaymentStatus: b.packagePaymentStatus,
        participantCount: b._count.participants,
        requirementsTotal: totalMap.get(b.id) ?? 0,
        requirementsDone: doneMap.get(b.id) ?? 0,
        ...(canSeeFinance ? await this.withFinance(b) : {}),
      });
    }
    if (doPage) {
      const total = await this.prisma.programBatch.count({ where });
      return { data: out, total, page: Math.max(Number(page) || 1, 1), limit: take };
    }
    return out;
  }

  private mapBatch(b: {
    id: string;
    pricePerPax?: unknown;
    packagePrice?: unknown;
    packagePaid?: unknown;
    [k: string]: unknown;
  }) {
    return {
      ...b,
      pricePerPax: b.pricePerPax != null ? Number(b.pricePerPax) : null,
      packagePrice: b.packagePrice != null ? Number(b.packagePrice) : null,
      packagePaid: Number(b.packagePaid ?? 0),
    };
  }

  @Roles(Role.ADMIN_TRAINING)
  @Post()
  async create(@Body() dto: CreateBatchDto, @CurrentUser() me: AuthUser) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException('endDate harus setelah startDate');
    const deliveryType = dto.deliveryType ?? DeliveryType.REGULAR;
    if (deliveryType === DeliveryType.IN_HOUSE && !(dto.packagePrice && dto.packagePrice > 0)) {
      throw new BadRequestException('Harga paket wajib diisi untuk pelaksanaan In-House.');
    }
    if (deliveryType === DeliveryType.REGULAR && !(dto.pricePerPax && dto.pricePerPax > 0)) {
      throw new BadRequestException('Harga per peserta wajib diisi untuk kelas reguler.');
    }
    const material = await this.prisma.material.findUnique({ where: { id: dto.materialId } });
    if (!material || !material.isActive) {
      throw new BadRequestException('Judul materi tidak ditemukan atau nonaktif.');
    }
    const batch = await this.prisma.programBatch.create({
      data: {
        batchName: dto.batchName,
        materialId: dto.materialId,
        category: dto.category ?? material.category ?? null,
        description: dto.description,
        syllabus: dto.syllabus,
        startDate: start,
        endDate: end,
        location: dto.location,
        status: dto.status ?? BatchStatus.PLANNED,
        deliveryType,
        clientName: dto.clientName,
        pricePerPax: dto.pricePerPax,
        packagePrice: dto.packagePrice,
      },
    });
    await this.audit.log(me.sub, 'batch.create', `Kelas ${batch.batchName} dibuat`);

    // Salin checklist Default (template) ke kelas baru
    const templates = await this.prisma.requirementTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ orderIndex: 'asc' }, { title: 'asc' }],
    });
    if (templates.length > 0) {
      await this.prisma.batchRequirement.createMany({
        data: templates.map((t, i) => ({
          batchId: batch.id,
          category: 'DEFAULT' as const,
          title: t.title,
          note: t.note,
          orderIndex: i,
        })),
      });
    }

    return this.mapBatch(batch);
  }

  /** Ubah data kelas reguler (nama/program/jadwal/lokasi/status). */
  @Roles(Role.ADMIN_TRAINING)
  @Patch(':id')
  async updateBatch(
    @Param('id') id: string,
    @Body() dto: UpdateBatchDto,
    @CurrentUser() me: AuthUser,
  ) {
    const existing = await this.prisma.programBatch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kelas tidak ditemukan');

    const start = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const end = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    if (end < start) throw new BadRequestException('endDate harus setelah startDate');

    const nextDelivery = dto.deliveryType ?? existing.deliveryType;
    if (dto.materialId) {
      const material = await this.prisma.material.findUnique({ where: { id: dto.materialId } });
      if (!material || !material.isActive) {
        throw new BadRequestException('Judul materi tidak ditemukan atau nonaktif.');
      }
    }
    if (nextDelivery === DeliveryType.IN_HOUSE) {
      const pkg = dto.packagePrice !== undefined ? dto.packagePrice : existing.packagePrice ? Number(existing.packagePrice) : 0;
      if (!(pkg && pkg > 0)) {
        throw new BadRequestException('Harga paket wajib diisi untuk pelaksanaan In-House.');
      }
    } else {
      const perPax =
        dto.pricePerPax !== undefined
          ? dto.pricePerPax
          : existing.pricePerPax != null
            ? Number(existing.pricePerPax)
            : 0;
      if (!(perPax && perPax > 0)) {
        throw new BadRequestException('Harga per peserta wajib diisi untuk kelas reguler.');
      }
    }

    const batch = await this.prisma.programBatch.update({
      where: { id },
      data: {
        batchName: dto.batchName,
        materialId: dto.materialId,
        category: dto.category,
        description: dto.description,
        syllabus: dto.syllabus,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        location: dto.location,
        status: dto.status,
        deliveryType: dto.deliveryType,
        clientName: dto.clientName,
        pricePerPax: dto.pricePerPax,
        packagePrice: dto.packagePrice,
      },
    });
    await this.audit.log(me.sub, 'batch.update', `Kelas ${existing.batchName} diperbarui`);
    return this.mapBatch(batch);
  }

  /** Hapus kelas reguler — hanya jika belum ada peserta/tagihan/pengeluaran. */
  @Roles(Role.ADMIN_TRAINING)
  @Delete(':id')
  async removeBatch(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    const batch = await this.prisma.programBatch.findUnique({
      where: { id },
      include: { _count: { select: { participants: true, revenues: true, expenses: true } } },
    });
    if (!batch) throw new NotFoundException('Kelas tidak ditemukan');
    const c = batch._count;
    if (c.participants > 0 || c.revenues > 0 || c.expenses > 0) {
      throw new BadRequestException(
        `Kelas "${batch.batchName}" masih memiliki data (${c.participants} peserta, ${c.revenues} tagihan, ${c.expenses} pengeluaran). Hapus datanya dulu.`,
      );
    }
    await this.prisma.programBatch.delete({ where: { id } });
    await this.audit.log(me.sub, 'batch.delete', `Kelas dihapus: ${batch.batchName}`);
    return { ok: true };
  }

  @Get(':id')
  async detail(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    const batch = await this.prisma.programBatch.findUnique({
      where: { id },
      include: {
        material: { select: { id: true, title: true, levelNumber: true, category: true } },
        participants: {
          include: { participant: { select: { id: true, name: true, email: true, phone: true, company: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!batch) throw new NotFoundException('Batch tidak ditemukan');

    const canSeeFinance = FINANCE_ROLES.includes(me.role as (typeof FINANCE_ROLES)[number]);
    const base = {
      id: batch.id,
      batchName: batch.batchName,
      material: batch.material,
      category: batch.category,
      description: batch.description,
      syllabus: batch.syllabus,
      startDate: batch.startDate,
      endDate: batch.endDate,
      location: batch.location,
      status: batch.status,
      deliveryType: batch.deliveryType,
      clientName: batch.clientName,
      pricePerPax: batch.pricePerPax != null ? Number(batch.pricePerPax) : null,
      packagePrice: batch.packagePrice != null ? Number(batch.packagePrice) : null,
      packagePaid: Number(batch.packagePaid),
      packagePaymentStatus: batch.packagePaymentStatus,
      participants: batch.participants.map((bp) => ({
        id: bp.id,
        participant: bp.participant,
        registrationStatus: bp.registrationStatus,
        feedbackScore: bp.feedbackScore,
        certificateNo: bp.certificateNo,
        ...(canSeeFinance ? {} : {}),
      })),
    };

    if (!canSeeFinance) return base;

    const [expenses, revenues] = await Promise.all([
      this.prisma.batchExpense.findMany({ where: { batchId: id }, orderBy: { expenseDate: 'desc' } }),
      this.prisma.batchRevenue.findMany({ where: { batchId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    const totals = await this.withFinance(batch);
    const revenueMap = new Map(revenues.map((r) => [r.participantId, r]));
    return {
      ...base,
      totals,
      expenses: expenses.map((e) => ({
        id: e.id,
        category: e.category,
        amount: Number(e.amount),
        description: e.description,
        expenseDate: e.expenseDate,
      })),
      participants: base.participants.map((bp) => {
        const rev = revenueMap.get(bp.participant.id);
        return {
          ...bp,
          revenue: rev
            ? {
                id: rev.id,
                totalAmount: Number(rev.totalAmount),
                totalPaid: Number(rev.totalPaid),
                paymentStatus: rev.paymentStatus,
              }
            : null,
        };
      }),
    };
  }
}

@Module({ controllers: [ProgramsController, BatchesController] })
export class TrainingModule {}
