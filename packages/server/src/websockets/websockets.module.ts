import { AccountsModule } from '../api/accounts/accounts.module';
import { CustomersModule } from '../api/customers/customers.module';
import { EventsModule } from '../api/events/events.module';
import { forwardRef, Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { WebhooksModule } from '../api/webhooks/webhooks.module';
import { JourneysModule } from '../api/journeys/journeys.module';
import { DevModeModule } from '../api/dev-mode/dev-mode.module';

@Module({
  imports: [
    forwardRef(() => AccountsModule),
    forwardRef(() => CustomersModule),
    forwardRef(() => JourneysModule),
    forwardRef(() => EventsModule),
    forwardRef(() => WebhooksModule),
    forwardRef(() => DevModeModule),
  ],
  providers: [WebsocketGateway],
  exports: [WebsocketGateway],
})
export class WebsocketsModule {}
