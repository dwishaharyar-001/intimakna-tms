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
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';

export class CreateMaterialDto {
  @IsString()
  @MinLength(3, { message: 'Judul materi minimal 3 karakter' })
  title!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  syllabus?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  levelNumber?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderInLevel?: number;
}

export class UpdateMaterialDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

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
  @IsInt()
  @Min(1)
  @Max(99)
  levelNumber?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderInLevel?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

const materialSelect = {
  id: true,
  title: true,
  category: true,
  description: true,
  syllabus: true,
  levelNumber: true,
  orderInLevel: true,
  isActive: true,
} as const;

@UseGuards(AuthGuard, RolesGuard)
@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Daftar Judul Materi + jumlah kelas. */
  @Get()
  async list(
    @Query('includeInactive') includeInactive?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('paged') paged?: string,
  ) {
    const doPage = paged === '1';
    const take = Math.min(Number(limit) || 10, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const rows = await this.prisma.material.findMany({
      where: includeInactive === 'true' ? undefined : undefined,
      orderBy: [{ orderInLevel: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { batches: true } } },
      skip: doPage ? skip : undefined,
      take: doPage ? take : undefined,
    });
    const mapped = rows.map((m) => ({
      ...m,
      classCount: m._count.batches,
    }));
    if (doPage) {
      const total = await this.prisma.material.count();
      return { data: mapped, total, page: Math.max(Number(page) || 1, 1), limit: take };
    }
    return mapped;
  }

  /** Learning Path: materi dikelompokkan per Level Number (belum berlevel di akhir). */
  @Get('path')
  async path() {
    const rows = await this.prisma.material.findMany({
      orderBy: [{ orderInLevel: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { batches: true } } },
    });
    const byLevel = new Map<number | 'none', typeof rows>();
    for (const m of rows) {
      const key = m.levelNumber ?? 'none';
      if (!byLevel.has(key)) byLevel.set(key, [] as typeof rows);
      byLevel.get(key)!.push(m);
    }
    const levels = [...byLevel.entries()]
      .map(([level, materials]) => ({
        level: level === 'none' ? null : (level as number),
        materials: materials.map((m) => ({ ...m, classCount: m._count.batches })),
      }))
      .sort((a, b) => {
        if (a.level === null) return 1;
        if (b.level === null) return -1;
        return a.level - b.level;
      });
    return {
      totalMaterials: rows.length,
      levels,
    };
  }

  @Roles(Role.ADMIN_TRAINING, Role.SUPER_ADMIN)
  @Post()
  async create(@Body() dto: CreateMaterialDto, @CurrentUser() me: AuthUser) {
    await this.assertUniqueTitle(dto.title);
    const material = await this.prisma.material.create({
      data: {
        title: dto.title.trim(),
        category: dto.category?.trim() || null,
        description: dto.description?.trim() || null,
        syllabus: dto.syllabus?.trim() || null,
        levelNumber: dto.levelNumber ?? null,
        orderInLevel: dto.orderInLevel ?? 0,
      },
    });
    await this.audit.log(me.sub, 'material.create', `Judul materi baru: ${material.title}`);
    return material;
  }

  @Roles(Role.ADMIN_TRAINING, Role.SUPER_ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMaterialDto, @CurrentUser() me: AuthUser) {
    const existing = await this.prisma.material.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Judul materi tidak ditemukan');
    if (dto.title && dto.title.trim().toLowerCase() !== existing.title.toLowerCase()) {
      await this.assertUniqueTitle(dto.title);
    }
    const material = await this.prisma.material.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        category: dto.category,
        description: dto.description,
        syllabus: dto.syllabus,
        levelNumber: dto.levelNumber,
        orderInLevel: dto.orderInLevel,
        isActive: dto.isActive,
      },
    });
    await this.audit.log(
      me.sub,
      'material.update',
      `Materi ${existing.title}: level=${material.levelNumber ?? '-'} order=${material.orderInLevel}`,
    );
    return material;
  }

  @Roles(Role.ADMIN_TRAINING, Role.SUPER_ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: { _count: { select: { batches: true } } },
    });
    if (!material) throw new NotFoundException('Judul materi tidak ditemukan');
    if (material._count.batches > 0) {
      throw new BadRequestException(
        `Materi "${material.title}" masih dipakai ${material._count.batches} kelas. Pindahkan/hapus kelasnya dulu.`,
      );
    }
    await this.prisma.material.delete({ where: { id } });
    await this.audit.log(me.sub, 'material.delete', `Judul materi dihapus: ${material.title}`);
    return { ok: true };
  }

  private async assertUniqueTitle(title: string) {
    const dup = await this.prisma.material.findFirst({
      where: { title: { equals: title.trim(), mode: 'insensitive' } },
    });
    if (dup) throw new BadRequestException(`Judul materi "${title.trim()}" sudah ada.`);
  }

  /**
   * Cakupan alumni per materi: siapa yang sudah mengikuti & siapa prospeknya.
   * mode=prereq (default) → prospek hanya alumni yang sudah menuntaskan level sebelumnya.
   */
  @Get(':id/prospects')
  async prospects(
    @Param('id') id: string,
    @Query('mode') mode = 'prereq',
    @Query('search') search?: string,
  ) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Judul materi tidak ditemukan');

    const [materials, participants, upcoming] = await Promise.all([
      this.prisma.material.findMany({ select: { id: true, levelNumber: true } }),
      this.prisma.participant.findMany({
        select: {
          id: true,
          name: true,
          company: true,
          phone: true,
          email: true,
          position: true,
          histories: {
            select: { batch: { select: { materialId: true } }, registrationStatus: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.programBatch.findFirst({
        where: { materialId: id, status: 'PLANNED' },
        orderBy: { startDate: 'asc' },
        select: { id: true, batchName: true, startDate: true, pricePerPax: true, packagePrice: true },
      }),
    ]);

    const levelOf = new Map(
      materials.filter((m) => m.levelNumber != null).map((m) => [m.id, m.levelNumber as number]),
    );
    const levelsAvailable = [...new Set(levelOf.values())].sort((a, b) => a - b);
    const level = material.levelNumber;
    const prevLevel = level != null && level > 1 ? level - 1 : null;

    const q = (search ?? '').trim().toLowerCase();
    const row = (p: (typeof participants)[number]) => ({
      id: p.id,
      name: p.name,
      company: p.company,
      phone: p.phone,
      email: p.email,
      position: p.position,
      attendedLevels: [...new Set(p.histories.map((h) => levelOf.get(h.batch.materialId ?? '')).filter((x): x is number => !!x))].sort((a, b) => a - b),
    });

    const attended: ReturnType<typeof row>[] = [];
    const prospects: ReturnType<typeof row>[] = [];
    for (const p of participants) {
      const attendedMaterialIds = new Set(p.histories.map((h) => h.batch.materialId).filter((x): x is string => !!x));
      const attendedLevels = new Set(p.histories.map((h) => levelOf.get(h.batch.materialId ?? '')).filter((x): x is number => !!x));
      const match = !q || p.name.toLowerCase().includes(q) || (p.company ?? '').toLowerCase().includes(q) || p.phone.includes(q);
      if (!match) continue;

      if (attendedMaterialIds.has(id)) {
        attended.push(row(p));
        continue;
      }
      if (mode === 'prereq' && prevLevel != null) {
        const prereqOk = levelsAvailable.length === 0 || attendedLevels.has(prevLevel);
        if (!prereqOk) continue;
      } else if (mode === 'prereq' && prevLevel == null) {
        // Level 1: tidak ada prasyarat
      }
      prospects.push(row(p));
    }

    return {
      material: { id: material.id, title: material.title, levelNumber: material.levelNumber },
      mode: mode === 'all' ? 'all' : 'prereq',
      prerequisiteLevel: prevLevel,
      upcomingClass: upcoming
        ? {
            id: upcoming.id,
            batchName: upcoming.batchName,
            startDate: upcoming.startDate,
            price: upcoming.packagePrice != null ? Number(upcoming.packagePrice) : Number(upcoming.pricePerPax ?? 0),
          }
        : null,
      attendedCount: attended.length,
      prospectCount: prospects.length,
      attended,
      prospects,
    };
  }
}

/** Ringkasan cakupan alumni per level (Learning Path coverage). */
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.SALES_MARKETING, Role.ADMIN_TRAINING, Role.MANAGEMENT, Role.SUPER_ADMIN)
@Controller('learning-path')
class LearningPathController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('coverage')
  async coverage(@Query('mode') mode = 'prereq') {
    const [materials, participants] = await Promise.all([
      this.prisma.material.findMany({
        orderBy: [{ levelNumber: 'asc' }, { orderInLevel: 'asc' }, { title: 'asc' }],
        include: { _count: { select: { batches: true } } },
      }),
      this.prisma.participant.findMany({
        select: { id: true, histories: { select: { batch: { select: { materialId: true } } } } },
      }),
    ]);
    const materialById = new Map(materials.map((m) => [m.id, m]));
    const attendedByMaterial = new Map<string, Set<string>>();
    const levelsByParticipant = new Map<string, Set<number>>();
    for (const p of participants) {
      const mats = new Set(p.histories.map((h) => h.batch.materialId).filter((x): x is string => !!x));
      const levels = new Set<number>();
      for (const mid of mats) {
        if (!attendedByMaterial.has(mid)) attendedByMaterial.set(mid, new Set());
        attendedByMaterial.get(mid)!.add(p.id);
        const lv = materialById.get(mid)?.levelNumber;
        if (lv) levels.add(lv);
      }
      levelsByParticipant.set(p.id, levels);
    }

    const levels = [...new Set(materials.map((m) => m.levelNumber ?? 0))].filter((l) => l > 0).sort((a, b) => a - b);
    const rows = levels.map((level) => {
      const mats = materials.filter((m) => m.levelNumber === level);
      const attendedSet = new Set<string>();
      const prospectSet = new Set<string>();
      const perMaterial = mats.map((m) => {
        const attendedIds = attendedByMaterial.get(m.id) ?? new Set<string>();
        for (const pid of attendedIds) attendedSet.add(pid);
        let prospects = 0;
        for (const p of participants) {
          if (attendedIds.has(p.id)) continue;
          if (mode !== 'all' && level > 1 && !(levelsByParticipant.get(p.id)?.has(level - 1) ?? false)) continue;
          prospects++;
          prospectSet.add(p.id);
        }
        return { id: m.id, title: m.title, classCount: m._count.batches, attended: attendedIds.size, prospects };
      });
      return {
        level,
        attended: attendedSet.size,
        prospects: prospectSet.size,
        totalAlumni: participants.length,
        materials: perMaterial,
      };
    });

    const unassigned = materials.filter((m) => !m.levelNumber);
    return { mode: mode === 'all' ? 'all' : 'prereq', totalAlumni: participants.length, levels: rows, unassignedMaterials: unassigned.length };
  }
}

@Module({ controllers: [MaterialsController, LearningPathController] })
export class MaterialsModule {}
