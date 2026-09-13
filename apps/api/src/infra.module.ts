import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catat aksi mutasi penting ke AuditLog. Gagal diam-diam bila user tidak diketahui. */
  async log(userId: string | null | undefined, action: string, details?: string, ipAddress?: string) {
    if (!userId) return;
    await this.prisma.auditLog
      .create({ data: { userId, action, details, ipAddress } })
      .catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [PrismaService, AuditService],
  exports: [PrismaService, AuditService],
})
export class PrismaModule {}
