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
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { RequirementCategory, Role } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';

export class CreateTemplateDto {
  @IsString()
  @MinLength(3, { message: 'Nama item minimal 3 karakter' })
  title!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateRequirementDto {
  @IsOptional()
  @IsEnum(RequirementCategory)
  category?: RequirementCategory;

  @IsString()
  @MinLength(2, { message: 'Nama item minimal 2 karakter' })
  title!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateRequirementDto {
  @IsOptional()
  @IsBoolean()
  isDone?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  note?: string | null;
}

/** Checklist Default (template) — diatur di Konfigurasi. */
@UseGuards(AuthGuard, RolesGuard)
@Controller('requirement-templates')
export class RequirementTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query('includeInactive') includeInactive?: string) {
    const rows = await this.prisma.requirementTemplate.findMany({
      where: includeInactive === 'true' ? undefined : { isActive: true },
      orderBy: [{ orderIndex: 'asc' }, { title: 'asc' }],
    });
    return rows;
  }

  @Roles(Role.ADMIN_TRAINING, Role.SUPER_ADMIN)
  @Post()
  async create(@Body() dto: CreateTemplateDto, @CurrentUser() me: AuthUser) {
    const max = await this.prisma.requirementTemplate.aggregate({ _max: { orderIndex: true } });
    const row = await this.prisma.requirementTemplate.create({
      data: {
        title: dto.title.trim(),
        note: dto.note?.trim() || null,
        orderIndex: dto.orderIndex ?? (max._max.orderIndex ?? -1) + 1,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log(me.sub, 'requirement.template.create', `Item default: ${row.title}`);
    return row;
  }

  @Roles(Role.ADMIN_TRAINING, Role.SUPER_ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTemplateDto, @CurrentUser() me: AuthUser) {
    const existing = await this.prisma.requirementTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Item default tidak ditemukan');
    const row = await this.prisma.requirementTemplate.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        note: dto.note,
        orderIndex: dto.orderIndex,
        isActive: dto.isActive,
      },
    });
    await this.audit.log(me.sub, 'requirement.template.update', `Item default: ${existing.title} → ${row.title}`);
    return row;
  }

  @Roles(Role.ADMIN_TRAINING, Role.SUPER_ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    const existing = await this.prisma.requirementTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Item default tidak ditemukan');
    await this.prisma.requirementTemplate.delete({ where: { id } });
    await this.audit.log(me.sub, 'requirement.template.delete', `Item default dihapus: ${existing.title}`);
    return { ok: true };
  }
}

/** Checklist per kelas: tambah/ubah/hapus item + centang (boleh saat kelas berjalan). */
@UseGuards(AuthGuard, RolesGuard)
@Controller('batches')
export class BatchRequirementsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get(':batchId/requirements')
  async list(@Param('batchId') batchId: string) {
    const batch = await this.prisma.programBatch.findUnique({ where: { id: batchId }, select: { id: true } });
    if (!batch) throw new NotFoundException('Kelas tidak ditemukan');
    const rows = await this.prisma.batchRequirement.findMany({
      where: { batchId },
      orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
      include: { doneBy: { select: { id: true, name: true } } },
    });
    const def = rows.filter((r) => r.category === RequirementCategory.DEFAULT);
    const cus = rows.filter((r) => r.category === RequirementCategory.CUSTOM);
    const summarize = (list: typeof rows) => ({
      total: list.length,
      done: list.filter((r) => r.isDone).length,
    });
    return {
      batchId,
      defaultItems: def,
      customItems: cus,
      summary: { ...summarize(rows), default: summarize(def), custom: summarize(cus) },
    };
  }

  @Roles(Role.ADMIN_TRAINING, Role.TRAINING_SUPPORT, Role.SUPER_ADMIN)
  @Post(':batchId/requirements')
  async create(@Param('batchId') batchId: string, @Body() dto: CreateRequirementDto, @CurrentUser() me: AuthUser) {
    const batch = await this.prisma.programBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true } });
    if (!batch) throw new NotFoundException('Kelas tidak ditemukan');
    if (batch.status === 'CANCELLED') throw new BadRequestException('Kelas sudah dibatalkan.');
    const max = await this.prisma.batchRequirement.aggregate({
      where: { batchId, category: dto.category ?? RequirementCategory.CUSTOM },
      _max: { orderIndex: true },
    });
    const row = await this.prisma.batchRequirement.create({
      data: {
        batchId,
        category: dto.category ?? RequirementCategory.CUSTOM,
        title: dto.title.trim(),
        note: dto.note?.trim() || null,
        orderIndex: (max._max.orderIndex ?? -1) + 1,
      },
      include: { doneBy: { select: { id: true, name: true } } },
    });
    await this.audit.log(me.sub, 'requirement.create', `Kelas ${batchId}: +${row.category} "${row.title}"`);
    return row;
  }
}

@UseGuards(AuthGuard, RolesGuard)
@Controller('requirements')
export class RequirementsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Roles(Role.ADMIN_TRAINING, Role.TRAINING_SUPPORT, Role.SUPER_ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRequirementDto, @CurrentUser() me: AuthUser) {
    const existing = await this.prisma.batchRequirement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Item checklist tidak ditemukan');
    const row = await this.prisma.batchRequirement.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        note: dto.note,
        isDone: dto.isDone,
        doneAt: dto.isDone === undefined ? undefined : dto.isDone ? new Date() : null,
        doneById: dto.isDone === undefined ? undefined : dto.isDone ? me.sub : null,
      },
      include: { doneBy: { select: { id: true, name: true } } },
    });
    await this.audit.log(
      me.sub,
      'requirement.update',
      `Checklist "${existing.title}": ${dto.isDone === undefined ? 'diubah' : dto.isDone ? 'DONE' : 'belum'}`,
    );
    return row;
  }

  @Roles(Role.ADMIN_TRAINING, Role.SUPER_ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    const existing = await this.prisma.batchRequirement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Item checklist tidak ditemukan');
    await this.prisma.batchRequirement.delete({ where: { id } });
    await this.audit.log(me.sub, 'requirement.delete', `Checklist dihapus: ${existing.title}`);
    return { ok: true };
  }
}

@Module({ controllers: [RequirementTemplatesController, BatchRequirementsController, RequirementsController] })
export class RequirementsModule {}
