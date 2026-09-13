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
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LeadStageKind, Role } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';

export class CreateStageDto {
  @IsString()
  @MinLength(1, { message: 'Label tidak boleh kosong' })
  @MaxLength(40)
  label!: string;

  @IsOptional()
  @IsEnum(LeadStageKind)
  kind?: LeadStageKind;
}

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label?: string;

  @IsOptional()
  @IsEnum(LeadStageKind)
  kind?: LeadStageKind;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderStagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[];
}

/** Daftar tahapan pipeline (dibaca semua peran yang sudah login) */
@UseGuards(AuthGuard)
@Controller('lead-stages')
export class LeadStagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.leadStage.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, label: true, kind: true, orderIndex: true },
    });
  }
}

/** Konfigurasi pipeline — khusus SUPER_ADMIN */
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('lead-stages/admin')
export class AdminLeadStagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('all')
  async all() {
    const rows = await this.prisma.leadStage.findMany({
      orderBy: { orderIndex: 'asc' },
      include: { _count: { select: { leads: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind,
      orderIndex: s.orderIndex,
      isActive: s.isActive,
      leadCount: s._count.leads,
    }));
  }

  @Post()
  async create(@Body() dto: CreateStageDto, @CurrentUser() me: AuthUser) {
    await this.assertUniqueLabel(dto.label);
    const max = await this.prisma.leadStage.aggregate({ _max: { orderIndex: true } });
    const stage = await this.prisma.leadStage.create({
      data: {
        label: dto.label.trim(),
        kind: dto.kind ?? LeadStageKind.OPEN,
        orderIndex: (max._max.orderIndex ?? -1) + 1,
      },
    });
    await this.audit.log(me.sub, 'leadstage.create', `Tahap baru: ${stage.label} (${stage.kind})`);
    return stage;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStageDto,
    @CurrentUser() me: AuthUser,
  ) {
    const stage = await this.prisma.leadStage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Tahap tidak ditemukan');

    if (dto.isActive === false && stage.isActive) {
      const count = await this.prisma.lead.count({ where: { stageId: id } });
      if (count > 0) {
        throw new BadRequestException(
          `Tidak bisa menonaktifkan tahap yang masih dipakai ${count} lead. Pindahkan lead-nya dulu.`,
        );
      }
    }
    if (dto.label && dto.label.trim().toLowerCase() !== stage.label.toLowerCase()) {
      await this.assertUniqueLabel(dto.label);
    }

    const updated = await this.prisma.leadStage.update({
      where: { id },
      data: {
        label: dto.label?.trim(),
        kind: dto.kind,
        isActive: dto.isActive,
      },
    });
    await this.audit.log(
      me.sub,
      'leadstage.update',
      `Tahap ${stage.label}: label=${updated.label} kind=${updated.kind} active=${updated.isActive}`,
    );
    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    const stage = await this.prisma.leadStage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Tahap tidak ditemukan');
    const count = await this.prisma.lead.count({ where: { stageId: id } });
    if (count > 0) {
      throw new BadRequestException(
        `Tahap "${stage.label}" masih dipakai ${count} lead. Pindahkan dulu sebelum dihapus.`,
      );
    }
    const others = await this.prisma.leadStage.count({ where: { isActive: true } });
    if (others <= 1) {
      throw new BadRequestException('Minimal harus ada satu tahap aktif.');
    }
    await this.prisma.leadStage.delete({ where: { id } });
    await this.audit.log(me.sub, 'leadstage.delete', `Tahap dihapus: ${stage.label}`);
    return { ok: true };
  }

  /** Terima urutan seluruh id tahap AKTIF; orderIndex disesuaikan berurutan. */
  @Post('reorder')
  async reorder(@Body() dto: ReorderStagesDto, @CurrentUser() me: AuthUser) {
    const stages = await this.prisma.leadStage.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const allIds = new Set(stages.map((s) => s.id));
    if (dto.ids.length !== allIds.size || dto.ids.some((id) => !allIds.has(id))) {
      throw new BadRequestException('Kirim seluruh daftar id tahap aktif untuk disusun ulang.');
    }
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.leadStage.update({ where: { id }, data: { orderIndex: index } }),
      ),
    );
    await this.audit.log(me.sub, 'leadstage.reorder', `Urutan tahap diperbarui`);
    return { ok: true };
  }

  private async assertUniqueLabel(label: string) {
    const exists = await this.prisma.leadStage.findFirst({
      where: { label: { equals: label.trim(), mode: 'insensitive' } },
    });
    if (exists) throw new BadRequestException(`Label "${label.trim()}" sudah dipakai tahap lain.`);
  }
}

@Module({ controllers: [LeadStagesController, AdminLeadStagesController] })
export class LeadStagesModule {}
