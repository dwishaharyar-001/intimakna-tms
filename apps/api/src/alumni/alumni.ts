import {
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RegistrationStatus, Role } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';
import { enrollIntoBatch } from '../shared/enroll';

export class EnrollDto {
  @IsUUID()
  batchId!: string;

  @IsOptional()
  @IsEnum(RegistrationStatus)
  registrationStatus?: RegistrationStatus;
}

@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.SALES_MARKETING, Role.ADMIN_TRAINING, Role.MANAGEMENT)
@Controller('alumni')
export class AlumniController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('batchId') batchId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const take = Math.min(Number(limit) || 10, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (batchId) {
      where.histories = { some: { batchId } };
    }
    const [data, total] = await Promise.all([
      this.prisma.participant.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          histories: {
            include: { batch: { include: { material: { select: { id: true, title: true, levelNumber: true } } } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.participant.count({ where }),
    ]);
    const formatted = data.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      company: p.company,
      position: p.position,
      historyCount: p.histories.length,
      lastTraining: p.histories[0]
        ? {
            category: p.histories[0].batch.category,
            batchName: p.histories[0].batch.batchName,
            endDate: p.histories[0].batch.endDate,
            location: p.histories[0].batch.location,
          }
        : null,
    }));
    return { data: formatted, total, page: Math.max(Number(page) || 1, 1), limit: take };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { id },
      include: {
        histories: {
          include: { batch: { include: { material: { select: { id: true, title: true, levelNumber: true } } } } },
          orderBy: { createdAt: 'desc' },
        },
        revenues: {
          include: {
            batch: { select: { id: true, batchName: true, category: true, material: { select: { title: true } } } },
          },
        },
        leads: {
          select: { id: true, source: true, createdAt: true, stage: { select: { id: true, label: true, kind: true } } },
        },
      },
    });
    if (!participant) throw new NotFoundException('Participant tidak ditemukan');

    const { histories, revenues, leads, ...profile } = participant;
    return {
      ...profile,
      histories: histories.map((h) => ({
        id: h.id,
        batchId: h.batchId,
        materialTitle: h.batch.material?.title ?? null,
        materialLevel: h.batch.material?.levelNumber ?? null,
        category: h.batch.category,
        batchName: h.batch.batchName,
        startDate: h.batch.startDate,
        endDate: h.batch.endDate,
        location: h.batch.location,
        registrationStatus: h.registrationStatus,
        feedbackScore: h.feedbackScore,
        certificateNo: h.certificateNo,
      })),
      revenues: revenues.map((r) => ({
        id: r.id,
        batchId: r.batchId,
        batchName: r.batch.batchName,
        category: r.batch.category,
        materialTitle: r.batch.material?.title ?? null,
        totalAmount: Number(r.totalAmount),
        totalPaid: Number(r.totalPaid),
        paymentStatus: r.paymentStatus,
      })),
      leads,
    };
  }

  @Post(':id/enroll')
  async enroll(
    @Param('id') id: string,
    @Body() dto: EnrollDto,
    @CurrentUser() me: AuthUser,
  ) {
    const participant = await this.prisma.participant.findUnique({ where: { id } });
    if (!participant) throw new NotFoundException('Participant tidak ditemukan');
    const result = await enrollIntoBatch(this.prisma, {
      batchId: dto.batchId,
      participantId: id,
      registrationStatus: dto.registrationStatus,
    });
    await this.audit.log(me.sub, 'alumni.enroll', `${participant.name} didaftarkan ke batch ${dto.batchId}`);
    return result;
  }
}

@Module({ controllers: [AlumniController] })
export class AlumniModule {}
