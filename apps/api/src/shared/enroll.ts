import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../infra.module';

export interface EnrollOptions {
  batchId: string;
  participantId?: string;
  participantSeed?: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
  };
  leadId?: string;
  registrationStatus?: RegistrationStatus;
}

/**
 * Alur pendaftaran bersama (lead ataupun alumni):
 * 1. resolve/create Participant (cocokkan via phone bila tidak dikirim id)
 * 2. buat BatchParticipant (skip bila sudah terdaftar di batch tsb)
 * 3. buat draf BatchRevenue (totalAmount = harga per peserta; UNPAID) —
 *    KHUSUS kelas reguler; untuk IN_HOUSE tagihan berupa harga paket di level kelas.
 * 4. bila ada leadId, tautkan participant ke lead tsb
 */
export async function enrollIntoBatch(prisma: PrismaService, opts: EnrollOptions) {
  const batch = await prisma.programBatch.findUnique({
    where: { id: opts.batchId },
  });
  if (!batch) throw new NotFoundException('Batch tidak ditemukan');
  if (batch.status === 'CANCELLED') {
    throw new BadRequestException('Batch berstatus CANCELLED, tidak bisa didaftarkan');
  }

  const pricePerPax = batch.pricePerPax != null ? Number(batch.pricePerPax) : 0;
  if (batch.deliveryType !== 'IN_HOUSE' && pricePerPax <= 0) {
    throw new BadRequestException('Harga per peserta kelas belum diisi.');
  }

  let participantId = opts.participantId;
  if (!participantId) {
    const seed = opts.participantSeed;
    if (!seed) throw new BadRequestException('Participant belum ditentukan');
    const existing = await prisma.participant.findUnique({ where: { phone: seed.phone } });
    if (existing) {
      participantId = existing.id;
    } else {
      const created = await prisma.participant.create({
        data: {
          name: seed.name,
          phone: seed.phone,
          email: seed.email ?? null,
          company: seed.company ?? null,
        },
      });
      participantId = created.id;
    }
  }

  const bp = await prisma.batchParticipant.upsert({
    where: { batchId_participantId: { batchId: batch.id, participantId } },
    create: {
      batchId: batch.id,
      participantId,
      registrationStatus: opts.registrationStatus ?? RegistrationStatus.REGISTERED,
    },
    update: {},
  });

  const revenue: { id: string } | null = batch.deliveryType === 'IN_HOUSE'
    ? null // in-house: ditagih sebagai harga paket (batch-level), bukan per peserta
    : await prisma.batchRevenue.upsert({
        where: { batchId_participantId: { batchId: batch.id, participantId } },
        create: {
          batchId: batch.id,
          participantId,
          totalAmount: pricePerPax,
        },
        update: {},
      });

  if (opts.leadId) {
    await prisma.lead.update({
      where: { id: opts.leadId },
      data: { participantId },
    });
  }

  return { participantId, batchParticipantId: bp.id, revenueId: revenue?.id ?? null };
}
