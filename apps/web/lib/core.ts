// ---------- Types (mirror API) ----------
export type Role =
  | 'MANAGEMENT'
  | 'SALES_MARKETING'
  | 'ADMIN_TRAINING'
  | 'TRAINING_SUPPORT'
  | 'FINANCE'
  | 'SUPER_ADMIN';

export type LeadSource = 'WHATSAPP' | 'CALL' | 'ALUMNI_REFERRAL' | 'POST_TRAINING';
export type LeadStageKind = 'OPEN' | 'WON' | 'LOST';
export type StageKind = LeadStageKind;
export type BatchStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type RegistrationStatus = 'REGISTERED' | 'ATTENDED' | 'COMPLETED' | 'DROPPED';
export type ExpenseCategory = 'VENUE' | 'TRAINER_FEE' | 'MODUL_ATK' | 'CATERING' | 'OTHER';

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface LeadRow {
  id: string;
  source: LeadSource;
  name: string;
  company?: string | null;
  phone: string;
  email?: string | null;
  stage?: { id: string; label: string; kind: LeadStageKind; orderIndex: number };
  interestProgram?: { id: string; title: string } | null;
  interestBatch?: { id: string; batchName: string; status: BatchStatus } | null;
  assignedTo?: { id: string; name: string } | null;
  participant?: { id: string; name: string; phone: string } | null;
  activities?: LeadActivityRow[];
  _count?: { activities: number };
  createdAt: string;
}

export interface StageRow {
  id: string;
  label: string;
  kind: LeadStageKind;
  orderIndex: number;
  isActive?: boolean;
  leadCount?: number;
}

export interface MaterialRow {
  id: string;
  title: string;
  category?: string | null;
  description?: string | null;
  syllabus?: string | null;
  levelNumber: number | null;
  orderInLevel: number;
  isActive: boolean;
  classCount?: number;
}

export type RequirementCategory = 'DEFAULT' | 'CUSTOM';
export interface RequirementTemplateRow {
  id: string;
  title: string;
  note?: string | null;
  orderIndex: number;
  isActive: boolean;
}
export interface BatchRequirementRow {
  id: string;
  category: RequirementCategory;
  title: string;
  note?: string | null;
  isDone: boolean;
  doneAt?: string | null;
  orderIndex: number;
  doneBy?: { id: string; name: string } | null;
}
export interface BatchRequirements {
  batchId: string;
  defaultItems: BatchRequirementRow[];
  customItems: BatchRequirementRow[];
  summary: {
    total: number;
    done: number;
    default: { total: number; done: number };
    custom: { total: number; done: number };
  };
}

export interface BatchRow {  id: string;
  batchName: string;
  material?: { id: string; title: string; levelNumber: number | null; category?: string | null } | null;
  category?: string | null;
  description?: string | null;
  syllabus?: string | null;
  startDate: string;
  endDate: string;
  location?: string | null;
  status: BatchStatus;
  participantCount: number;
  requirementsTotal?: number;
  requirementsDone?: number;
  deliveryType?: DeliveryType;
  clientName?: string | null;
  pricePerPax?: number | null;
  packagePrice?: number | null;
  packagePaid?: number;
  packagePaymentStatus?: PaymentStatus;
  revenue?: number;
  paidTotal?: number;
  expense?: number;
  net?: number;
}

export interface FinancialRow {
  batchId: string;
  batchName: string;
  category?: string | null;
  startDate: string;
  endDate: string;
  status: BatchStatus;
  revenue: number;
  paidTotal: number;
  expense: number;
  net: number;
  margin: number;
}

export interface AlumniRow {
  id: string;
  name: string;
  email?: string | null;
  phone: string;
  company?: string | null;
  position?: string | null;
  historyCount: number;
  lastTraining: {
    category?: string | null;
    batchName: string;
    endDate: string;
    location?: string | null;
  } | null;
}

export interface ProgramRow {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  syllabus?: string | null;
  standardPrice: number;
  inHousePrice?: number | null;
}

export type DeliveryType = 'REGULAR' | 'IN_HOUSE';
export const DELIVERY_LABEL: Record<DeliveryType, string> = {
  REGULAR: 'Kelas Reguler',
  IN_HOUSE: 'In-House Korporat',
};

export const DELIVERY_BADGE: Record<DeliveryType, string> = {
  REGULAR: 'bg-slate-100 text-slate-600',
  IN_HOUSE: 'bg-[#F3E8FF] text-[#7E57C2]',
};

// ---------- Learning Path: cakupan & prospek ----------
export interface CoverageMaterial {
  id: string;
  title: string;
  classCount: number;
  attended: number;
  prospects: number;
}
export interface CoverageLevel {
  level: number;
  attended: number;
  prospects: number;
  totalAlumni: number;
  materials: CoverageMaterial[];
}
export interface Coverage {
  mode: 'prereq' | 'all';
  totalAlumni: number;
  levels: CoverageLevel[];
  unassignedMaterials: number;
}
export interface ProspectPerson {
  id: string;
  name: string;
  company?: string | null;
  phone: string;
  email?: string | null;
  position?: string | null;
  attendedLevels: number[];
}
export interface MaterialProspects {
  material: { id: string; title: string; levelNumber: number | null };
  mode: 'prereq' | 'all';
  prerequisiteLevel: number | null;
  upcomingClass: { id: string; batchName: string; startDate: string; price: number } | null;
  attendedCount: number;
  prospectCount: number;
  attended: ProspectPerson[];
  prospects: ProspectPerson[];
}

// ---------- Labels ----------
export const ROLE_LABEL: Record<Role, string> = {
  MANAGEMENT: 'Management',
  SALES_MARKETING: 'Sales & Marketing',
  ADMIN_TRAINING: 'Admin Training',
  TRAINING_SUPPORT: 'Training Support',
  FINANCE: 'Finance',
  SUPER_ADMIN: 'Super Admin',
};

export const ROLE_BADGE: Record<Role, string> = {
  MANAGEMENT: 'bg-violet-100 text-violet-700',
  SALES_MARKETING: 'bg-sky-100 text-sky-700',
  ADMIN_TRAINING: 'bg-amber-100 text-amber-700',
  TRAINING_SUPPORT: 'bg-emerald-100 text-emerald-700',
  FINANCE: 'bg-rose-100 text-rose-600',
  SUPER_ADMIN: 'bg-[#F3E8FF] text-[#7E57C2]',
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  WHATSAPP: 'WhatsApp',
  CALL: 'Telepon',
  ALUMNI_REFERRAL: 'Referensi Alumni',
  POST_TRAINING: 'Post-Training',
};

// ---------- Aktivitas follow-up ----------
export type ActivityType = 'CALL' | 'WHATSAPP' | 'EMAIL' | 'MEETING' | 'OTHER';
export type ActivityStatus = 'PLANNED' | 'DONE' | 'CANCELLED';
export type ActivityOutcome = 'NO_ANSWER' | 'POSITIVE' | 'NEEDS_FOLLOWUP' | 'REJECTED' | 'CONVERTED';

export interface LeadActivityRow {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  summary: string;
  outcome?: ActivityOutcome | null;
  scheduledAt?: string | null;
  doneAt?: string | null;
  nextActionAt?: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
}

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  CALL: 'Telepon',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  MEETING: 'Tatap Muka',
  OTHER: 'Lainnya',
};

export const ACTIVITY_ICON: Record<ActivityType, string> = {
  CALL: '📞',
  WHATSAPP: '💬',
  EMAIL: '✉️',
  MEETING: '🤝',
  OTHER: '📌',
};

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  PLANNED: 'Direncanakan',
  DONE: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const ACTIVITY_STATUS_BADGE: Record<ActivityStatus, string> = {
  PLANNED: 'bg-amber-100 text-amber-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export const ACTIVITY_OUTCOME_LABEL: Record<ActivityOutcome, string> = {
  NO_ANSWER: 'Tidak dijawab',
  POSITIVE: 'Respons positif',
  NEEDS_FOLLOWUP: 'Perlu follow-up',
  REJECTED: 'Menolak',
  CONVERTED: 'Terkonversi',
};

export const STAGE_BADGE: Record<LeadStageKind, string> = {
  OPEN: 'bg-[#FDECEA] text-[#E53935]',
  WON: 'bg-emerald-100 text-emerald-700',
  LOST: 'bg-slate-100 text-slate-500',
};

export const STAGE_DOT: Record<LeadStageKind, string> = {
  OPEN: '#E53935',
  WON: '#4CAF50',
  LOST: '#9E9E9E',
};

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  PLANNED: 'Direncanakan',
  ONGOING: 'Berjalan',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const BATCH_STATUS_BADGE: Record<BatchStatus, string> = {
  PLANNED: 'bg-slate-100 text-slate-600',
  ONGOING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-600',
};

export const PAY_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: 'Belum Bayar',
  PARTIAL: 'Sebagian',
  PAID: 'Lunas',
};

export const PAY_STATUS_BADGE: Record<PaymentStatus, string> = {
  UNPAID: 'bg-slate-100 text-slate-500',
  PARTIAL: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
};

export const REG_STATUS_LABEL: Record<RegistrationStatus, string> = {
  REGISTERED: 'Terdaftar',
  ATTENDED: 'Hadir',
  COMPLETED: 'Selesai',
  DROPPED: 'Mengundurkan Diri',
};

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  VENUE: 'Venue',
  TRAINER_FEE: 'Fee Trainer',
  MODUL_ATK: 'Modul & ATK',
  CATERING: 'Konsumsi',
  OTHER: 'Lainnya',
};

// ---------- Format runtime (mengikuti Konfigurasi Umum) ----------
export interface RuntimeFormats {
  numberLocale: string;
  currency: string;
  dateFormat: string;
  timeFormat: '24h' | '12h';
}

export const DEFAULT_RUNTIME_FORMATS: RuntimeFormats = {
  numberLocale: 'id-ID',
  currency: 'IDR',
  dateFormat: 'dd MMM yyyy',
  timeFormat: '24h',
};

let runtimeFormats: RuntimeFormats = { ...DEFAULT_RUNTIME_FORMATS };
let runtimeRowsPerPage = 10;
const rowsListeners = new Set<(n: number) => void>();

export const setRuntimeFormats = (patch: Partial<RuntimeFormats>) => {
  runtimeFormats = { ...runtimeFormats, ...patch };
};

export const getRuntimeFormats = () => runtimeFormats;

export const setRuntimeRowsPerPage = (rows: number) => {
  if (Number.isFinite(rows) && rows >= 1) {
    runtimeRowsPerPage = Math.floor(rows);
    rowsListeners.forEach((cb) => cb(runtimeRowsPerPage));
  }
};

export const getRuntimeRowsPerPage = () => runtimeRowsPerPage;

/** Berlangganan perubahan default baris per halaman (dari Konfigurasi Umum). */
export const onRuntimeRowsPerPageChange = (cb: (rows: number) => void) => {
  rowsListeners.add(cb);
  return () => {
    rowsListeners.delete(cb);
  };
};

const DATE_LOCALE: Record<string, string> = { 'id-ID': 'id-ID', 'en-US': 'en-US' };

// ---------- Helpers ----------
export const money = (n?: number | string | null) =>
  new Intl.NumberFormat(runtimeFormats.numberLocale, {
    style: 'currency',
    currency: runtimeFormats.currency,
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0));

export const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = DATE_LOCALE[runtimeFormats.numberLocale] ?? 'id-ID';
  const opts: Intl.DateTimeFormatOptions =
    runtimeFormats.dateFormat === 'dd/MM/yyyy'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : runtimeFormats.dateFormat === 'MMM dd, yyyy'
        ? { month: 'short', day: '2-digit', year: 'numeric' }
        : { day: '2-digit', month: 'short', year: 'numeric' };
  if (runtimeFormats.timeFormat === '12h') {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
    opts.hour12 = true;
  }
  return date.toLocaleDateString(locale, opts);
};

export const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(' ');
