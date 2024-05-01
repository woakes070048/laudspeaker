import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../accounts/entities/accounts.entity';
import twilio from 'twilio';
import { WebhooksProcessor } from './webhooks.processor';
import { BullModule } from '@nestjs/bullmq';
import { TemplatesModule } from '../templates/templates.module';
import { Step } from '../steps/entities/step.entity';
import { KafkaModule } from '../kafka/kafka.module';

function getProvidersList() {
  let providerList: Array<any> = [
    WebhooksService,
  ];

  if (process.env.LAUDSPEAKER_PROCESS_TYPE == "QUEUE") {
    providerList = [
      ...providerList,
      WebhooksProcessor,
    ];
  }

  return providerList;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Step]),
    BullModule.registerQueue({
      name: 'webhooks',
    }),
    BullModule.registerQueue({
      name: 'events_pre',
    }),
    TemplatesModule,
    KafkaModule,
  ],
  providers: getProvidersList(),
  controllers: [WebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(twilio.webhook())
      .forRoutes({ path: '/webhooks/twilio', method: RequestMethod.POST });
  }
}
