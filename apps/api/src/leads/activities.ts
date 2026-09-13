import {
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ActivityOutcome, ActivityStatus, Role } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';

export class UpdateActivityDto {
  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @IsOptional()
  @IsString()
  @MinLength(3)
  summary?: string;

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

const leadSelect = {
  id: true,
  name: true,
  company: true,
  phone: true,
  stage: { select: { id: true, label: true, kind: true } },
} as const;

@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.SALES_MARKETING, Role.ADMIN_TRAINING, Role.MANAGEMENT)
@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Agenda follow-up: due=today (default) | overdue | upcoming */
  @Get('today')
  async today(
    @CurrentUser() me: AuthUser,
    @Query('due') due = 'today',
    @Query('mine') mine?: string,
  ) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = { status: ActivityStatus.PLANNED };
    if (due === 'overdue') where.scheduledAt = { lt: start };
    else if (due === 'upcoming') where.scheduledAt = { gte: end };
    else where.scheduledAt = { gte: start, lt: end };

    if (mine === 'true' && me.role === Role.SALES_MARKETING) {
      where.lead = { assignedToId: me.sub };
    }

    const rows = await this.prisma.leadActivity.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      take: 100,
      include: {
        lead: { select: leadSelect },
        createdBy: { select: { id: true, name: true } },
      },
    });
    return rows;
  }

  /** Ubah/realisasi/batalkan aktivitas. */
  @Roles(Role.SALES_MARKETING, Role.ADMIN_TRAINING)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateActivityDto, @CurrentUser() me: AuthUser) {
    const existing = await this.prisma.leadActivity.findUnique({
      where: { id },
      include: { lead: { select: { id: true, name: true } } },
    });
    if (!existing) throw new NotFoundException('Aktivitas tidak ditemukan');

    const status = dto.status ?? existing.status;
    let doneAt = dto.doneAt !== undefined ? (dto.doneAt ? new Date(dto.doneAt) : null) : existing.doneAt;
    if (status === ActivityStatus.DONE && !doneAt) doneAt = new Date();
    if (status === ActivityStatus.PLANNED) doneAt = dto.doneAt ? new Date(dto.doneAt) : null;

    const updated = await this.prisma.leadActivity.update({
      where: { id },
      data: {
        status: dto.status,
        summary: dto.summary,
        outcome: dto.outcome,
        scheduledAt: dto.scheduledAt !== undefined ? (dto.scheduledAt ? new Date(dto.scheduledAt) : null) : undefined,
        doneAt,
        nextActionAt:
          dto.nextActionAt !== undefined
            ? dto.nextActionAt
              ? new Date(dto.nextActionAt)
              : null
            : undefined,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await this.audit.log(
      me.sub,
      'lead.activity.update',
      `Lead ${existing.lead.name}: aktivitas ${existing.type} -> ${updated.status}`,
    );
    return updated;
  }
}

@Module({ controllers: [ActivitiesController] })
export class ActivitiesModule {}
