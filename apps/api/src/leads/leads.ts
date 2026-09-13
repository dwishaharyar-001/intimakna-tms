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
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ActivityOutcome, ActivityStatus, ActivityType, LeadSource, Role } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';
import { enrollIntoBatch } from '../shared/enroll';

export class CreateLeadDto {
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsString()
  @MinLength(6)
  phone!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email tidak valid' })
  email?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** Minat: program yang diminati (opsional) */
  @IsOptional()
  @IsUUID()
  interestProgramId?: string | null;

  /** Minat: kelas reguler spesifik (opsional; bila diisi, program mengikuti kelas) */
  @IsOptional()
  @IsUUID()
  interestBatchId?: string | null;
}

export class CreateActivityDto {
  @IsEnum(ActivityType)
  type!: ActivityType;

  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @IsString()
  @MinLength(3, { message: 'Ringkasan aktivitas minimal 3 karakter' })
  summary!: string;

  @IsOptional()
  @IsEnum(ActivityOutcome)
  outcome?: ActivityOutcome | null;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsDateString()
  doneAt?: string | null;

  @IsOptional()
  @IsDateString()
  nextActionAt?: string | null;
}

/** Catatan singkat wajib saat mengubah status/tahap lead. */
export class StageNoteDto {
  @IsEnum(ActivityType)
  type!: ActivityType;

  @IsString()
  @MinLength(3, { message: 'Catatan aktivitas minimal 3 karakter' })
  summary!: string;

  @IsOptional()
  @IsEnum(ActivityOutcome)
  outcome?: ActivityOutcome | null;
}

export class UpdateLeadDto {
  /** Tahap (kolom) di pipeline — dikonfigurasi SUPER_ADMIN */
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;

  @IsOptional()
  @IsUUID()
  interestProgramId?: string | null;

  @IsOptional()
  @IsUUID()
  interestBatchId?: string | null;

  /** WAJIB bila stageId diubah: catatan aktivitas follow-up */
  @IsOptional()
  @ValidateNested()
  @Type(() => StageNoteDto)
  activity?: StageNoteDto;
}

export class EnrollLeadDto {
  @IsUUID()
  batchId!: string;
}

export class ConvertLeadDto {
  @IsOptional()
  @IsUUID()
  participantId?: string;
}

const stageSelect = { id: true, label: true, kind: true, orderIndex: true } as const;

const activitySelect = {
  id: true,
  type: true,
  status: true,
  summary: true,
  outcome: true,
  scheduledAt: true,
  doneAt: true,
  nextActionAt: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

const interestInclude = {
  interestProgram: { select: { id: true, title: true } },
  interestBatch: { select: { id: true, batchName: true, status: true } },
} as const;

@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.SALES_MARKETING, Role.ADMIN_TRAINING, Role.MANAGEMENT)
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @CurrentUser() me: AuthUser,
    @Query('stage') stage?: string,
    @Query('source') source?: string,
    @Query('search') search?: string,
    @Query('mine') mine?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '200',
  ) {
    const take = Math.min(Number(limit) || 200, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where: Record<string, unknown> = {};
    if (stage) where.stageId = stage;
    if (source) where.source = source;
    if (mine === 'true' && me.role === Role.SALES_MARKETING) where.assignedToId = me.sub;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          stage: { select: stageSelect },
          assignedTo: { select: { id: true, name: true } },
          participant: { select: { id: true, name: true, phone: true } },
          activities: { take: 30, orderBy: { createdAt: 'desc' }, select: activitySelect },
          _count: { select: { activities: true } },
          ...interestInclude,
        },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { data, total, page: Math.max(Number(page) || 1, 1), limit: take };
  }

  /** Validasi binding minat: program dan kelas reguler berdiri sendiri (tidak saling terkait). */
  private async resolveInterest(programId?: string | null, batchId?: string | null) {
    if (batchId) {
      const batch = await this.prisma.programBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new BadRequestException('Kelas reguler tidak ditemukan.');
    }
    if (programId) {
      const program = await this.prisma.trainingProgram.findUnique({ where: { id: programId } });
      if (!program) throw new BadRequestException('Program tidak ditemukan.');
    }
    return { programId: programId ?? null, batchId: batchId ?? null };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        stage: { select: stageSelect },
        assignedTo: { select: { id: true, name: true } },
        participant: true,
        activities: { take: 100, orderBy: { createdAt: 'desc' }, select: activitySelect },
        _count: { select: { activities: true } },
        ...interestInclude,
      },
    });
    if (!lead) throw new NotFoundException('Lead tidak ditemukan');
    return lead;
  }

  @Post()
  async create(@Body() dto: CreateLeadDto, @CurrentUser() me: AuthUser) {
    const firstStage = await this.prisma.leadStage.findFirst({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });
    if (!firstStage) {
      throw new BadRequestException('Pipeline leads belum punya tahap. Hubungi Super Admin.');
    }
    const interest = await this.resolveInterest(dto.interestProgramId, dto.interestBatchId);
    const lead = await this.prisma.lead.create({
      data: {
        source: dto.source ?? LeadSource.WHATSAPP,
        name: dto.name,
        company: dto.company,
        phone: dto.phone,
        email: dto.email,
        stageId: firstStage.id,
        assignedToId: dto.assignedToId ?? (me.role === Role.SALES_MARKETING ? me.sub : undefined),
        interestProgramId: interest.programId,
        interestBatchId: interest.batchId,
      },
      include: { stage: { select: stageSelect }, ...interestInclude },
    });
    await this.audit.log(me.sub, 'lead.create', `Lead baru: ${lead.name} (${lead.phone})`);
    return lead;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() me: AuthUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead tidak ditemukan');

    let stageId = dto.stageId;
    if (stageId) {
      const stage = await this.prisma.leadStage.findUnique({ where: { id: stageId } });
      if (!stage || !stage.isActive) {
        throw new BadRequestException('Tahap tujuan tidak ditemukan atau nonaktif.');
      }
    }

    // Binding minat (opsional) — program & kelas berdiri sendiri, divalidasi terpisah
    let interestProgramId = dto.interestProgramId;
    let interestBatchId = dto.interestBatchId;
    if (interestProgramId !== undefined || interestBatchId !== undefined) {
      const resolved = await this.resolveInterest(interestProgramId, interestBatchId);
      interestProgramId = resolved.programId;
      interestBatchId = resolved.batchId;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Aturan: perubahan status/tahap WAJIB disertai catatan aktivitas
      if (dto.stageId && dto.stageId !== lead.stageId) {
        if (!dto.activity?.type || !dto.activity?.summary) {
          throw new BadRequestException(
            'Perubahan status lead wajib disertai catatan aktivitas (jenis + ringkasan).',
          );
        }
        await tx.leadActivity.create({
          data: {
            leadId: id,
            type: dto.activity.type,
            status: ActivityStatus.DONE,
            doneAt: new Date(),
            summary: dto.activity.summary,
            outcome: dto.activity.outcome ?? null,
            createdById: me.sub,
          },
        });
      }
      return tx.lead.update({
        where: { id },
        data: { stageId, assignedToId: dto.assignedToId, interestProgramId, interestBatchId },
        include: {
          stage: { select: stageSelect },
          activities: { take: 30, orderBy: { createdAt: 'desc' }, select: activitySelect },
          _count: { select: { activities: true } },
          ...interestInclude,
        },
      });
    });
    await this.audit.log(
      me.sub,
      'lead.update',
      `Lead ${lead.name}: tahap=${updated.stage.label} assign=${dto.assignedToId ?? '-'}`,
    );
    return updated;
  }

  /** Catat aktivitas follow-up (tidak mengubah status lead). */
  @Roles(Role.SALES_MARKETING, Role.ADMIN_TRAINING)
  @Post(':id/activities')
  async addActivity(
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() me: AuthUser,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead tidak ditemukan');
    const isPlanned = (dto.status ?? ActivityStatus.DONE) === ActivityStatus.PLANNED;
    const activity = await this.prisma.leadActivity.create({
      data: {
        leadId: id,
        type: dto.type,
        status: dto.status ?? ActivityStatus.DONE,
        summary: dto.summary,
        outcome: dto.outcome ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : isPlanned ? new Date() : null,
        doneAt: isPlanned ? null : dto.doneAt ? new Date(dto.doneAt) : new Date(),
        nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : null,
        createdById: me.sub,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await this.audit.log(
      me.sub,
      'lead.activity.create',
      `Lead ${lead.name}: ${dto.type} (${activity.status}) — ${dto.summary}`,
    );
    return activity;
  }

  /** Konversi manual lead -> peserta (mis. pembayaran via transfer di luar sistem). */
  @Post(':id/convert')
  async convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() me: AuthUser,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead tidak ditemukan');
    const participantId = dto.participantId ?? lead.participantId;
    if (!participantId) throw new BadRequestException('Lead belum memiliki participant terkait');
    const wonStage = await this.prisma.leadStage.findFirst({
      where: { kind: 'WON', isActive: true },
      orderBy: { orderIndex: 'asc' },
    });
    if (!wonStage) {
      throw new BadRequestException('Belum ada tahap "Menang" (WON) di pipeline.');
    }
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { participantId, stageId: wonStage.id },
      include: { stage: { select: stageSelect } },
    });
    await this.prisma.leadActivity.create({
      data: {
        leadId: id,
        type: ActivityType.OTHER,
        status: ActivityStatus.DONE,
        doneAt: new Date(),
        summary: 'Konversi manual: lead ditandai Menang (peserta tertaut).',
        outcome: ActivityOutcome.CONVERTED,
        createdById: me.sub,
      },
    });
    await this.audit.log(me.sub, 'lead.convert', `Lead ${lead.name} -> ${updated.stage.label}`);
    return updated;
  }

  /** Daftarkan lead ke batch: buat participant (jika belum ada) + tagihan, tanpa menutup lead. */
  @Post(':id/enroll')
  async enroll(
    @Param('id') id: string,
    @Body() dto: EnrollLeadDto,
    @CurrentUser() me: AuthUser,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead tidak ditemukan');
    const result = await enrollIntoBatch(this.prisma, {
      batchId: dto.batchId,
      participantId: lead.participantId ?? undefined,
      participantSeed: {
        name: lead.name,
        phone: lead.phone,
        email: lead.email ?? undefined,
        company: lead.company ?? undefined,
      },
      leadId: id,
    });
    await this.audit.log(me.sub, 'lead.enroll', `Lead ${lead.name} didaftarkan ke batch ${dto.batchId}`);
    return result;
  }
}

@Module({ controllers: [LeadsController] })
export class LeadsModule {}
