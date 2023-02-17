import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../accounts/entities/accounts.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Verification } from '../auth/entities/verification.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Template } from '../templates/entities/template.entity';
import { Job } from '../jobs/entities/job.entity';
import { Segment } from '../segments/entities/segment.entity';
import { Installation } from '../slack/entities/installation.entity';
import { State } from '../slack/entities/state.entity';
import { Integration } from '../integrations/entities/integration.entity';
import { Database } from '../integrations/entities/database.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Job,
      Segment,
      Installation,
      State,
      WebhookEvent,
      Workflow,
      Template,
      Audience,
      Verification,
      Integration,
      Database,
    ]),
  ],
})
export class DBModule {}
