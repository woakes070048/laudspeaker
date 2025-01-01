import {
  PushPlatforms,
  Template,
} from '../api/templates/entities/template.entity';
import {
  forwardRef,
  Inject,
  LoggerService,
  UseInterceptors,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  WsException,
} from '@nestjs/websockets';
import { createHash, randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { AccountsService } from '../api/accounts/accounts.service';
import { Account } from '../api/accounts/entities/accounts.entity';
import { CustomersService } from '../api/customers/customers.service';
import { EventsService } from '../api/events/events.service';
import { WebhooksService } from '../api/webhooks/webhooks.service';
import { JourneysService } from '../api/journeys/journeys.service';
import { DevModeService } from '../api/dev-mode/dev-mode.service';
import { RavenInterceptor } from 'nest-raven';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
interface SocketData {
  account: Account & { apiKey: string };
  customerId: string;
  development?: boolean;
  relatedDevConnection?: string;
  relatedClientDevConnection?: string;
  devJourney?: string;
}

const fieldSerializerMap = {
  Number,
  String,
  Date: String,
  Email: String,
};

@UseInterceptors(new RavenInterceptor())
@WebSocketGateway({
  cors: true,
})
export class WebsocketGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server: Server;

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => AccountsService))
    private accountsService: AccountsService,
    @Inject(forwardRef(() => CustomersService))
    private customersService: CustomersService,
    @Inject(forwardRef(() => EventsService))
    private eventsService: EventsService,
    @Inject(forwardRef(() => JourneysService))
    private journeyService: JourneysService,
    @Inject(forwardRef(() => DevModeService))
    private devModeService: DevModeService,
    @Inject(forwardRef(() => WebhooksService))
    private readonly webhooksService: WebhooksService,
  ) { }

  log(message, method, session, user = 'ANONYMOUS') {
    this.logger.log(
      message,
      JSON.stringify({
        class: WebsocketGateway.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }
  debug(message, method, session, user = 'ANONYMOUS') {
    this.logger.debug(
      message,
      JSON.stringify({
        class: WebsocketGateway.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }
  warn(message, method, session, user = 'ANONYMOUS') {
    this.logger.warn(
      message,
      JSON.stringify({
        class: WebsocketGateway.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }
  error(error, method, session, user = 'ANONYMOUS') {
    this.logger.error(
      error.message,
      error.stack,
      JSON.stringify({
        class: WebsocketGateway.name,
        method: method,
        session: session,
        cause: error.cause,
        name: error.name,
        user: user,
      })
    );
  }
  verbose(message, method, session, user = 'ANONYMOUS') {
    this.logger.verbose(
      message,
      JSON.stringify({
        class: WebsocketGateway.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }

  public async handleConnection(socket: Socket) {
    return;
  }

  public async handleDisconnect(socket: Socket) {
    if (socket.data.development && socket.handshake.auth.apiKey) {
      const sockets = await this.server.fetchSockets();
      const socketToClose = sockets.find(
        (el) => el.data?.relatedDevConnection === socket.id
      );
      socketToClose?.emit('devModeNeedReconnection');
    }
  }

  @SubscribeMessage('ping')
  public async handlePing(@ConnectedSocket() socket: Socket) {
    socket.emit('log', 'pong');
  }

  /**
   * Confirm with frontend that event has been processed.
   * This is here because frontend rate limits how many of
   * the same events a customer can send.
   *
   * @param customerId customer to send processed info to
   * @param hash hash of processed event
   * @returns boolean indicating if customer received confirmation
   */
  public async sendProcessed(
    customerID: string,
    eventString: string,
    trackerID: string
  ): Promise<boolean> {
    const sockets = await this.server.fetchSockets();

    const customerSocket = sockets.find(
      (socket) => socket.data.customerId === customerID
    );

    if (!customerSocket) return false;

    customerSocket.emit(
      'processedEvent',
      this.getHash(customerID, trackerID, eventString)
    );
    customerSocket.emit(
      'log',
      `Processed event ${eventString} for component ${trackerID}.`
    );
    customerSocket.emit(
      'log',
      `Processed event ${this.getHash(customerID, trackerID, eventString)}.`
    );

    return true;
  }

  /**
   * If socket is connected, sends state of specified
   * tracker to customer for frontend to render.
   * @param customerID Customer to send the state to.
   * @param trackerID ID of the tracker that needs updating
   * @param data Data to update with
   * @returns boolean indicating if state successfully reached customer
   */
  public async sendCustomComponentState(
    customerID: string,
    trackerID: string,
    data: Record<string, any>
  ): Promise<boolean> {
    for (const field of (data?.fields || []) as {
      name: string;
      type: string;
      defaultValue: string;
    }[]) {
      const serializer: (value: unknown) => unknown =
        fieldSerializerMap[field.type] || ((value: unknown) => value);

      data[field.name] = serializer(data[field.name]);
    }

    const show = !data.hidden;
    // delete data.hidden;
    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      if (socket.data.customerId === customerID) {
        socket.emit('custom', {
          show,
          trackerId: trackerID,
          ...data,
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Generates SHA256 hash of event+trackerID+customerID
   * @param customerID
   * @param trackerID
   * @param eventString
   * @returns
   */
  private getHash(customerID: any, trackerID: any, eventString: any): string {
    return Buffer.from(
      createHash('sha256')
        .update(
          String((eventString as string) + (trackerID as string) + customerID)
        )
        .digest('hex')
    ).toString('base64');
  }

  public async sendModal(
    customerId: string,
    template: Template
  ): Promise<boolean> {
    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      if (socket.data.customerId === customerId) {
        socket.emit('modal', template.modalState);
        return true;
      }
    }
    return false;
  }

  /*
   * old fire event for modal
   */
  /*
  @SubscribeMessage('fire')
  public async handleFire(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    event: { [key: string]: unknown }
  ) {
    try {
      const {
        account: { teams },
        customerId,
      } = socket.data as SocketData;

      const workspace = teams?.[0]?.organization?.workspaces?.[0];

      let customer = await this.customersService.CustomerModel.findOne({
        _id: customerId,
        workspaceId: workspace.id,
      });

      if (!customer || customer.isFreezed) {
        socket.emit(
          'error',
          'Invalid customer id. Creating new anonymous customer...'
        );
        customer = await this.customersService.CustomerModel.create({
          isAnonymous: true,
          workspaceId: workspace.id,
        });

        socket.data.customerId = customer.id;
        socket.emit('customerId', customer.id);
      }

      await this.eventsService.customPayload(
        socket.data.account,
        {
          correlationKey: '_id',
          correlationValue: customer.id,
          source: AnalyticsProviderTypes.TRACKER,
          event: '',
          payload: event,
        },
        socket.data.session
      );

      socket.emit('log', 'Successful fire');
    } catch (e) {
      socket.emit('error', e);
    }
  }
  */

  /*
   *
  
  @SubscribeMessage('fire')
  public async handleFire(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    fullPayload: { eventName: string; payload: string; customerId: string }
  ) {
    try {
      const {
        account: { teams },
        customerId,
      } = socket.data as SocketData;

      const workspace = teams?.[0]?.organization?.workspaces?.[0];

      let customer = await this.customersService.CustomerModel.findOne({
        _id: customerId,
        workspaceId: workspace.id,
      });

      if (!customer) {
        socket.emit(
          'error',
          'Invalid customer id. Creating new anonymous customer...'
        );
        customer = await this.customersService.CustomerModel.create({
          isAnonymous: true,
          workspaceId: workspace.id,
        });

        socket.data.customerId = customer.id;
        socket.emit('customerId', customer.id);
      }

      const { eventName, payload } = fullPayload;

      // Parse the JSON string payload to an object
      let payloadObj = {};
      payloadObj = JSON.parse(payload);

      const eventStruct: EventDto = {
        correlationKey: '_id',
        correlationValue: customer.id,
        source: AnalyticsProviderTypes.MOBILE,
        payload: payloadObj,
        event: eventName,
      };
      await this.eventsService.customPayload(
        { account: socket.data.account, workspace: workspace },
        eventStruct,
        socket.data.session
      );

      socket.emit('log', 'Successful fire');
    } catch (e) {
      this.error(e, this.handleFire.name, randomUUID());
      socket.emit('error', e);
    }
  }
   */

  @SubscribeMessage('moveToNode')
  public async moveToNode(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    nodeId: string
  ) {
    try {
      if (socket.data.processingDev)
        throw new WsException('Processing another dev option please wait');

      socket.data.processingDev = true;

      // await this.devModeService.moveToNode(
      //   socket.data.account,
      //   socket.data.devJourney,
      //   nodeId
      // );
      const devMode = await this.devModeService.getDevModeState(
        socket.data.account.id,
        socket.data.devJourney
      );

      const localSocket = this.server.sockets.sockets.get(
        socket.data.relatedDevConnection
      );

      // for (const key in devMode.devModeState.customerData.customComponents) {
      //   localSocket.emit('custom', {
      //     trackerId: key,
      //     ...devMode.devModeState.customerData.customComponents[key],
      //   });
      // }

      socket.emit('nodeMovedTo', nodeId);
    } catch (error) {
      if (error instanceof WsException) socket.emit('moveError', error.message);
    } finally {
      socket.data.processingDev = false;
    }
  }

  /*
  @SubscribeMessage('fcm_token')
  public async getFCMToken(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    {
      type,
      token,
    }: {
      type: PushPlatforms;
      token: string;
    }
  ) {
    if (!type) throw new WsException('No type given');
    if (!token) throw new WsException('No FCM token given');

    const {
      account: { teams },
      customerId,
    } = socket.data as SocketData;

    const workspace = teams?.[0]?.organization?.workspaces?.[0];

    let customer = await this.customersService.CustomerModel.findOne({
      _id: customerId,
      workspaceId: workspace.id,
    });

    if (!customer) {
      socket.emit(
        'error',
        'Invalid customer id. Creating new anonymous customer...'
      );
      customer = await this.customersService.CustomerModel.create({
        isAnonymous: true,
        workspaceId: workspace.id,
      });

      socket.data.customerId = customer.id;
      socket.emit('customerId', customer.id);
    }

    await this.customersService.CustomerModel.updateOne(
      { _id: customerId },
      {
        [type === PushPlatforms.ANDROID
          ? 'androidDeviceToken'
          : 'iosDeviceToken']: token,
      }
    );
  }
  */
}
