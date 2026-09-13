import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ExpenseCategory, PaymentStatus, Role } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';

export class CreateExpenseDto {
  @IsUUID()
  batchId!: string;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;
}

export class UpdateRevenueDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalPaid?: number;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
}

const FINANCE_ROLES = [Role.FINANCE, Role.MANAGEMENT, Role.ADMIN_TRAINING] as const;

async function summarizeBatch(
  prisma: PrismaService,
  batch: { id: string; deliveryType: string; packagePrice: unknown; packagePaid: unknown },
) {
  const [rev, exp] = await Promise.all([
    prisma.batchRevenue.aggregate({
      where: { batchId: batch.id },
      _sum: { totalAmount: true, totalPaid: true },
    }),
    prisma.batchExpense.aggregate({ where: { batchId: batch.id }, _sum: { amount: true } }),
  ]);
  const inHouse = batch.deliveryType === 'IN_HOUSE';
  const revenue = inHouse ? Number(batch.packagePrice ?? 0) : Number(rev._sum.totalAmount ?? 0);
  const paidTotal = inHouse ? Number(batch.packagePaid ?? 0) : Number(rev._sum.totalPaid ?? 0);
  const expense = Number(exp._sum.amount ?? 0);
  const net = revenue - expense;
  return {
    revenue,
    paidTotal,
    expense,
    net,
    margin: revenue > 0 ? net / revenue : 0,
  };
}

export class UpdatePackagePaymentDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  packagePaid?: number;

  @IsOptional()
  @IsEnum(PaymentStatus)
  packagePaymentStatus?: PaymentStatus;
}

@UseGuards(AuthGuard, RolesGuard)
@Roles(...FINANCE_ROLES)
@Controller('financials')
export class FinancialsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Ringkasan profitabilitas seluruh batch (untuk dashboard manajemen). */
  @Get('overview')
  async overview() {
    const batches = await this.prisma.programBatch.findMany({
      orderBy: { startDate: 'desc' },
    });
    const rows = [];
    for (const b of batches) {
      const s = await summarizeBatch(this.prisma, b);
      rows.push({
        batchId: b.id,
        batchName: b.batchName,
        category: b.category,
        startDate: b.startDate,
        endDate: b.endDate,
        status: b.status,
        deliveryType: b.deliveryType,
        clientName: b.clientName,
        ...s,
      });
    }
    return rows;
  }

  /** Net profit real-time per batch: Revenue - Expense. */
  @Get('batches/:batchId/summary')
  async summary(@Param('batchId') batchId: string) {
    const batch = await this.prisma.programBatch.findUnique({
      where: { id: batchId },
      include: {
        _count: { select: { participants: true } },
      },
    });
    if (!batch) throw new NotFoundException('Batch tidak ditemukan');
    const totals = await summarizeBatch(this.prisma, batch);
    const expenses = await this.prisma.batchExpense.findMany({
      where: { batchId },
      orderBy: { expenseDate: 'desc' },
    });
    const revenues = await this.prisma.batchRevenue.findMany({
      where: { batchId },
      include: { participant: { select: { id: true, name: true, company: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      batch: {
        id: batch.id,
        batchName: batch.batchName,
        category: batch.category,
        description: batch.description,
        status: batch.status,
        startDate: batch.startDate,
        endDate: batch.endDate,
        participantCount: batch._count.participants,
        deliveryType: batch.deliveryType,
        clientName: batch.clientName,
        packagePrice: batch.packagePrice != null ? Number(batch.packagePrice) : null,
        packagePaid: Number(batch.packagePaid),
        packagePaymentStatus: batch.packagePaymentStatus,
      },
      totals,
      expenses: expenses.map((e) => ({
        id: e.id,
        category: e.category,
        amount: Number(e.amount),
        description: e.description,
        expenseDate: e.expenseDate,
      })),
      revenues: revenues.map((r) => ({
        id: r.id,
        participantId: r.participantId,
        participantName: r.participant.name,
        company: r.participant.company,
        totalAmount: Number(r.totalAmount),
        totalPaid: Number(r.totalPaid),
        paymentStatus: r.paymentStatus,
      })),
    };
  }

  @Get('revenues')
  async revenues(
    @Query('batchId') batchId?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('paged') paged?: string,
  ) {
    const doPage = paged === '1';
    const take = Math.min(Number(limit) || 10, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where: Record<string, unknown> = {};
    if (batchId) where.batchId = batchId;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    const rows = await this.prisma.batchRevenue.findMany({
      where,
      skip: doPage ? skip : undefined,
      take: doPage ? take : undefined,
      include: {
        participant: { select: { id: true, name: true, company: true } },
        batch: { select: { id: true, batchName: true, category: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = rows.map((r) => ({
      id: r.id,
      batchId: r.batchId,
      batchName: r.batch.batchName,
      category: r.batch.category,
      participantId: r.participantId,
      participantName: r.participant.name,
      company: r.participant.company,
      totalAmount: Number(r.totalAmount),
      totalPaid: Number(r.totalPaid),
      paymentStatus: r.paymentStatus,
    }));
    if (doPage) {
      const total = await this.prisma.batchRevenue.count({ where });
      return { data: mapped, total, page: Math.max(Number(page) || 1, 1), limit: take };
    }
    return mapped;
  }

  @Roles(Role.FINANCE)
  @Post('expenses')
  async createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() me: AuthUser) {
    const batch = await this.prisma.programBatch.findUnique({ where: { id: dto.batchId } });
    if (!batch) throw new NotFoundException('Batch tidak ditemukan');
    const expense = await this.prisma.batchExpense.create({
      data: {
        batchId: dto.batchId,
        category: dto.category,
        amount: dto.amount,
        description: dto.description,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
      },
    });
    await this.audit.log(
      me.sub,
      'finance.expense.create',
      `Batch ${batch.batchName}: ${dto.category} ${dto.amount}`,
    );
    return expense;
  }

  /**
   * Pembayaran paket untuk kelas In-House (bukan per peserta).
   */
  @Roles(Role.FINANCE)
  @Patch('batches/:batchId/package')
  async updatePackagePayment(
    @Param('batchId') batchId: string,
    @Body() dto: UpdatePackagePaymentDto,
    @CurrentUser() me: AuthUser,
  ) {
    const batch = await this.prisma.programBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Kelas tidak ditemukan');
    if (batch.deliveryType !== 'IN_HOUSE') {
      throw new BadRequestException('Kelas ini bukan In-House — pembayaran dilakukan per peserta.');
    }
    const price = Number(batch.packagePrice ?? 0);
    if (price <= 0) throw new BadRequestException('Harga paket belum diisi untuk kelas ini.');

    let packagePaid = dto.packagePaid !== undefined ? dto.packagePaid : Number(batch.packagePaid);
    let status = dto.packagePaymentStatus ?? batch.packagePaymentStatus;
    if (status === PaymentStatus.PAID) packagePaid = price;
    if (status === PaymentStatus.UNPAID) packagePaid = 0;
    if (status === PaymentStatus.PARTIAL && packagePaid >= price) status = PaymentStatus.PAID;
    if (packagePaid > price) throw new BadRequestException('Nilai terbayar melebihi harga paket.');

    const updated = await this.prisma.programBatch.update({
      where: { id: batchId },
      data: { packagePaid, packagePaymentStatus: status },
    });
    await this.audit.log(
      me.sub,
      'finance.package.update',
      `Paket ${batch.batchName}: paid=${packagePaid} status=${status}`,
    );
    return { packagePaid: Number(updated.packagePaid), packagePaymentStatus: updated.packagePaymentStatus };
  }

  /**
   * Update pembayaran tagihan.
   * Aturan bisnis (keputusan user): Lead menjadi Peserta saat biaya training dibayar.
   * Saat status menjadi PAID penuh, lead tertaut (atau lead dgn no. HP sama) otomatis CLOSED_WON.
   */
  @Roles(Role.FINANCE)
  @Patch('revenues/:id')
  async updateRevenue(@Param('id') id: string, @Body() dto: UpdateRevenueDto, @CurrentUser() me: AuthUser) {
    const revenue = await this.prisma.batchRevenue.findUnique({
      where: { id },
      include: { participant: true, batch: true },
    });
    if (!revenue) throw new NotFoundException('Tagihan tidak ditemukan');

    let totalPaid =
      dto.totalPaid !== undefined ? dto.totalPaid : Number(revenue.totalPaid);
    let paymentStatus = dto.paymentStatus ?? revenue.paymentStatus;
    if (paymentStatus === PaymentStatus.PAID && totalPaid < Number(revenue.totalAmount)) {
      totalPaid = Number(revenue.totalAmount); // PAID berarti lunas
    }
    if (paymentStatus === PaymentStatus.UNPAID) totalPaid = 0;
    if (paymentStatus === PaymentStatus.PARTIAL && totalPaid >= Number(revenue.totalAmount)) {
      paymentStatus = PaymentStatus.PAID;
    }
    if (totalPaid > Number(revenue.totalAmount)) {
      throw new BadRequestException('totalPaid melebihi totalAmount');
    }

    const updated = await this.prisma.batchRevenue.update({
      where: { id },
      data: { totalPaid, paymentStatus },
    });

    // Konversi lead -> peserta otomatis saat pembayaran lunas:
    // cari tahap Menang (WON) aktif; lead tertaut / cocok no. HP di tahap OPEN ikut dipindah.
    let convertedLeadId: string | null = null;
    if (paymentStatus === PaymentStatus.PAID) {
      const wonStage = await this.prisma.leadStage.findFirst({
        where: { kind: 'WON', isActive: true },
        orderBy: { orderIndex: 'asc' },
      });
      if (wonStage) {
        const linkedLead = await this.prisma.lead.findFirst({
          where: { participantId: revenue.participantId, stage: { kind: { not: 'WON' } } },
        });
        const target =
          linkedLead ??
          (await this.prisma.lead.findFirst({
            where: {
              participantId: null,
              phone: revenue.participant.phone,
              stage: { kind: 'OPEN' },
            },
            orderBy: { createdAt: 'asc' },
          }));
        if (target) {
          await this.prisma.lead.update({
            where: { id: target.id },
            data: { stageId: wonStage.id, participantId: revenue.participantId },
          });
          // Catat otomatis sebagai aktivitas sistem (aturan: perubahan status selalu bercatatan)
          await this.prisma.leadActivity.create({
            data: {
              leadId: target.id,
              type: 'OTHER',
              status: 'DONE',
              doneAt: new Date(),
              summary: `Pembayaran lunas (${revenue.batch.batchName}) — lead otomatis menjadi Menang.`,
              outcome: 'CONVERTED',
              createdById: me.sub,
            },
          });
          convertedLeadId = target.id;
        }
      }
    }

    await this.audit.log(
      me.sub,
      'finance.revenue.update',
      `Batch ${revenue.batch.batchName} / ${revenue.participant.name}: paid=${totalPaid} status=${paymentStatus}` +
        (convertedLeadId ? ` | lead ${convertedLeadId} -> CLOSED_WON` : ''),
    );
    return {
      id: updated.id,
      totalPaid: Number(updated.totalPaid),
      paymentStatus: updated.paymentStatus,
      convertedLeadId,
    };
  }
}

@Module({ controllers: [FinancialsController] })
export class FinancialsModule {}
