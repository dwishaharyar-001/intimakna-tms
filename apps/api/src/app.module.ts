import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './infra.module';
import { AuthModule } from './auth/auth';
import { UsersModule } from './users/users';
import { LeadsModule } from './leads/leads';
import { ActivitiesModule } from './leads/activities';
import { AlumniModule } from './alumni/alumni';
import { FinancialsModule } from './financials/financials';
import { TrainingModule } from './training/training';
import { LeadStagesModule } from './settings/lead-stages';
import { AlumniImportModule } from './settings/alumni-import';
import { MaterialsModule } from './materials/materials';
import { RequirementsModule } from './requirements/requirements';
import { PageLayoutModule } from './layout/layout';
import { GeneralSettingsModule } from './settings/general';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    LeadsModule,
    ActivitiesModule,
    AlumniModule,
    FinancialsModule,
    TrainingModule,
    LeadStagesModule,
    AlumniImportModule,
    MaterialsModule,
    RequirementsModule,
    PageLayoutModule,
    GeneralSettingsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
