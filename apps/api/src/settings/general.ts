import { Body, Controller, Get, Module, Post, Put, UseGuards, UseInterceptors, UploadedFile, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Public, Roles, RolesGuard } from '../common/auth-guard';
import { Role } from '@prisma/client';

/**
 * Setelan umum aplikasi (Konfigurasi Umum) — baris tunggal `AppSetting.id = 'global'`.
 * Grup: identitas organisasi, bahasa & format, periode berjalan, operasional default, tampilan.
 */

const SETTING_ID = 'global';

const ROLES = Object.values(Role) as string[];
const DATE_FORMATS = ['dd MMM yyyy', 'dd/MM/yyyy', 'MMM dd, yyyy'];
const NUMBER_LOCALES = ['id-ID', 'en-US'];
const CURRENCIES = ['IDR', 'USD'];
const SEMESTERS = ['GANJIL', 'GENAP'] as const;
const CLASS_STATUSES = ['PLANNED', 'ONGOING', 'COMPLETED'];
const DENSITIES = ['comfortable', 'compact'] as const;
const ROWS_OPTIONS = [5, 10, 25, 50, 100];
const MAX_LOGO_RAW = 300 * 1024;
const MAX_LOGO_DATAURL = 400_000;

/** Deteksi jenis gambar dari magic bytes / isi awal berkas. */
function detectImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  const head = buf.subarray(0, 512).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

export interface GeneralSettings {
  identity: {
    legalName: string;
    brandName: string;
    tagline: string;
    address: string;
    city: string;
    phone: string;
    email: string;
    website: string;
    taxId: string;
    logoDataUrl: string;
  };
  locale: {
    language: 'id' | 'en';
    dateFormat: string;
    currency: string;
    numberLocale: string;
    timezone: string;
    weekStart: 'monday' | 'sunday';
    timeFormat: '24h' | '12h';
  };
  period: {
    semester: 'GANJIL' | 'GENAP';
    year: number;
    label: string;
  };
  defaults: {
    rowsPerPage: number;
    classStatus: string;
    regularPrice: number;
    newUserRole: string;
    workStart: string;
    workEnd: string;
  };
  appearance: {
    accent: string;
    density: 'comfortable' | 'compact';
    theme: 'light';
  };
}

export const DEFAULT_SETTINGS: GeneralSettings = {
  identity: {
    legalName: 'PT Intimakna',
    brandName: 'Intimakna TMS',
    tagline: 'Training Management System',
    address: '',
    city: '',
    phone: '',
    email: '',
    website: '',
    taxId: '',
    logoDataUrl: '',
  },
  locale: {
    language: 'id',
    dateFormat: 'dd MMM yyyy',
    currency: 'IDR',
    numberLocale: 'id-ID',
    timezone: 'Asia/Jakarta',
    weekStart: 'monday',
    timeFormat: '24h',
  },
  period: {
    semester: 'GANJIL',
    year: new Date().getFullYear(),
    label: `GANJIL ${new Date().getFullYear()}`,
  },
  defaults: {
    rowsPerPage: 10,
    classStatus: 'PLANNED',
    regularPrice: 0,
    newUserRole: 'SALES_MARKETING',
    workStart: '08:00',
    workEnd: '17:00',
  },
  appearance: {
    accent: '#E53935',
    density: 'comfortable',
    theme: 'light',
  },
};

const str = (v: unknown, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const pick = <T extends string>(v: unknown, allowed: readonly string[]): T | undefined =>
  typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : undefined;
const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const time = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined);
const hexColor = (v: unknown) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : undefined;

/** Gabungkan data tersimpan dengan nilai bawaan (aman untuk data lama/parsial). */
export function mergeSettings(raw: unknown): GeneralSettings {
  const saved = (raw ?? {}) as Partial<GeneralSettings>;
  return {
    identity: { ...DEFAULT_SETTINGS.identity, ...(saved.identity ?? {}) },
    locale: { ...DEFAULT_SETTINGS.locale, ...(saved.locale ?? {}) },
    period: { ...DEFAULT_SETTINGS.period, ...(saved.period ?? {}) },
    defaults: { ...DEFAULT_SETTINGS.defaults, ...(saved.defaults ?? {}) },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...(saved.appearance ?? {}) },
  };
}

@UseGuards(AuthGuard, RolesGuard)
@Controller('settings')
export class GeneralSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Tanpa login: identitas brand & format tampilan untuk halaman login. */
  @Public()
  @Get('public')
  async getPublic() {
    const full = mergeSettings((await this.prisma.appSetting.findUnique({ where: { id: SETTING_ID } }))?.data);
    return {
      identity: {
        brandName: full.identity.brandName,
        legalName: full.identity.legalName,
        tagline: full.identity.tagline,
        logoDataUrl: full.identity.logoDataUrl,
      },
      locale: full.locale,
      period: full.period,
      appearance: { accent: full.appearance.accent, density: full.appearance.density },
    };
  }

  /** Jalur cadangan: unggah berkas logo langsung (multipart) bila browser tidak bisa membaca berkas. */
  @Post('general/logo')
  @Roles(Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LOGO_RAW } }))
  async uploadLogo(
    @UploadedFile() file: { buffer?: Buffer; size?: number } | undefined,
    @CurrentUser() me: AuthUser,
  ) {
    const buf = file?.buffer;
    if (!buf || !buf.length) {
      throw new BadRequestException('Berkas logo tidak diterima. Pilih berkas dan coba lagi.');
    }
    const mime = detectImageMime(buf);
    if (!mime) {
      throw new BadRequestException('Format tidak dikenali. Gunakan PNG, JPG, WEBP, atau SVG.');
    }
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    if (dataUrl.length > MAX_LOGO_DATAURL) {
      throw new PayloadTooLargeException('Logo terlalu besar. Perkecil dulu (maks ± 300 KB atau 320×320 px).');
    }
    const current = mergeSettings((await this.prisma.appSetting.findUnique({ where: { id: SETTING_ID } }))?.data);
    const next: GeneralSettings = {
      ...current,
      identity: { ...current.identity, logoDataUrl: dataUrl },
    };
    await this.prisma.appSetting.upsert({
      where: { id: SETTING_ID },
      create: { id: SETTING_ID, data: next as object, updatedBy: me.sub },
      update: { data: next as object, updatedBy: me.sub },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: me.sub,
        action: 'SETTINGS_GENERAL_UPDATE',
        details: 'Logo organisasi diperbarui (unggah berkas)',
      },
    });
    return { settings: next };
  }

  @Get('general')
  async get() {
    const row = await this.prisma.appSetting.findUnique({ where: { id: SETTING_ID } });
    return { settings: mergeSettings(row?.data), updatedAt: row?.updatedAt ?? null };
  }

  @Put('general')
  @Roles(Role.SUPER_ADMIN)
  async put(@Body() body: Partial<GeneralSettings>, @CurrentUser() me: AuthUser) {
    const current = mergeSettings((await this.prisma.appSetting.findUnique({ where: { id: SETTING_ID } }))?.data);
    const input = body ?? {};
    const i = (input.identity ?? {}) as Partial<GeneralSettings['identity']>;
    const l = (input.locale ?? {}) as Partial<GeneralSettings['locale']>;
    const p = (input.period ?? {}) as Partial<GeneralSettings['period']>;
    const d = (input.defaults ?? {}) as Partial<GeneralSettings['defaults']>;
    const a = (input.appearance ?? {}) as Partial<GeneralSettings['appearance']>;

    const logo = typeof i.logoDataUrl === 'string' ? i.logoDataUrl : undefined;

    const next: GeneralSettings = {
      identity: {
        legalName: str(i.legalName, 160) ?? current.identity.legalName,
        brandName: str(i.brandName, 60) ?? current.identity.brandName,
        tagline: str(i.tagline, 120) ?? current.identity.tagline,
        address: str(i.address, 240) ?? current.identity.address,
        city: str(i.city, 80) ?? current.identity.city,
        phone: str(i.phone, 40) ?? current.identity.phone,
        email: str(i.email, 120) ?? current.identity.email,
        website: str(i.website, 160) ?? current.identity.website,
        taxId: str(i.taxId, 60) ?? current.identity.taxId,
        logoDataUrl:
          logo === undefined
            ? current.identity.logoDataUrl
            : logo.length === 0
              ? ''
              : /^https?:\/\/[^\s]+$/i.test(logo.trim()) && logo.length <= 500
                ? logo.trim()
                : /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(logo) && logo.length <= 400_000
                  ? logo
                  : current.identity.logoDataUrl,
      },
      locale: {
        language: pick(l.language, ['id', 'en'] as const) ?? current.locale.language,
        dateFormat: pick(l.dateFormat, DATE_FORMATS) ?? current.locale.dateFormat,
        currency: pick(l.currency, CURRENCIES) ?? current.locale.currency,
        numberLocale: pick(l.numberLocale, NUMBER_LOCALES) ?? current.locale.numberLocale,
        timezone: str(l.timezone, 64) ?? current.locale.timezone,
        weekStart: pick(l.weekStart, ['monday', 'sunday'] as const) ?? current.locale.weekStart,
        timeFormat: pick(l.timeFormat, ['24h', '12h'] as const) ?? current.locale.timeFormat,
      },
      period: {
        semester: pick(p.semester, SEMESTERS) ?? current.period.semester,
        year: num(p.year, 2000, 2100) ?? current.period.year,
        label: str(p.label, 40) ?? current.period.label,
      },
      defaults: {
        rowsPerPage: num(d.rowsPerPage, 5, 100) && ROWS_OPTIONS.includes(Number(d.rowsPerPage)) ? Number(d.rowsPerPage) : current.defaults.rowsPerPage,
        classStatus: pick(d.classStatus, CLASS_STATUSES) ?? current.defaults.classStatus,
        regularPrice: num(d.regularPrice, 0, 1_000_000_000) ?? current.defaults.regularPrice,
        newUserRole: pick(d.newUserRole, ROLES) ?? current.defaults.newUserRole,
        workStart: time(d.workStart) ?? current.defaults.workStart,
        workEnd: time(d.workEnd) ?? current.defaults.workEnd,
      },
      appearance: {
        accent: hexColor(a.accent) ?? current.appearance.accent,
        density: pick(a.density, DENSITIES) ?? current.appearance.density,
        theme: 'light',
      },
    };

    await this.prisma.appSetting.upsert({
      where: { id: SETTING_ID },
      create: { id: SETTING_ID, data: next as object, updatedBy: me.sub },
      update: { data: next as object, updatedBy: me.sub },
    });

    const groups = Object.keys(input).filter((k) => k in next);
    await this.prisma.auditLog.create({
      data: {
        userId: me.sub,
        action: 'SETTINGS_GENERAL_UPDATE',
        details: `Konfigurasi Umum diperbarui (${groups.join(', ') || 'tanpa perubahan grup'})`,
      },
    });

    return { settings: next };
  }
}

@Module({ controllers: [GeneralSettingsController] })
export class GeneralSettingsModule {}
