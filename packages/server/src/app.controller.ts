import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { randomUUID } from 'crypto';
import { RavenInterceptor } from 'nest-raven';
@Controller()
export class AppController {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger
  ) {}

  log(message, method, session, user = 'ANONYMOUS') {
    this.logger.log(
      message,
      JSON.stringify({
        class: AppController.name,
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
        class: AppController.name,
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
        class: AppController.name,
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
        class: AppController.name,
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
        class: AppController.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }

  @UseInterceptors(new RavenInterceptor())
  @Get()
  root() {
    const session = randomUUID();
    this.debug(`GET / `, this.root.name, session);
    return 'laudspeaker API v 1.0';
  }

  @UseInterceptors(new RavenInterceptor())
  @Get('/sentry-test')
  sentryTest() {
    const session = randomUUID();
    this.debug(`GET / `, this.root.name, session);
    throw new HttpException('sentry-online', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  @UseInterceptors(new RavenInterceptor())
  @Get('/webhook-get-test')
  webhookGetTest(@Req() req: Request) {
    //console.log("Getting GET");

    const session = randomUUID();
    this.log(JSON.stringify(req.body, null, 2), this.root.name, session);
    this.log(JSON.stringify(req.headers, null, 2), this.root.name, session);

    this.debug(`GET / `, this.root.name, session);
    return 'laudspeaker API v 1.0';
  }

  @UseInterceptors(new RavenInterceptor())
  @Post('/webhook-post-test')
  webhookPostTest(@Req() req: Request) {
    const session = randomUUID();

    //console.log("Getting POST");

    this.log(JSON.stringify(req.body, null, 2), this.root.name, session);
    this.log(JSON.stringify(req.headers, null, 2), this.root.name, session);
    this.debug(`POST / `, this.root.name, session);
    return 'laudspeaker API v 1.0';
  }

  @UseInterceptors(new RavenInterceptor())
  @Put('/webhook-put-test')
  webhookPutTest(@Req() req: Request) {
    const session = randomUUID();
    this.log(JSON.stringify(req.body, null, 2), this.root.name, session);
    this.log(JSON.stringify(req.headers, null, 2), this.root.name, session);
    this.debug(`PUT / `, this.root.name, session);
    return 'laudspeaker API v 1.0';
  }

  @UseInterceptors(new RavenInterceptor())
  @Patch('/webhook-patch-test')
  webhookPathTest(@Req() req: Request) {
    const session = randomUUID();
    this.log(JSON.stringify(req.body, null, 2), this.root.name, session);
    this.log(JSON.stringify(req.headers, null, 2), this.root.name, session);
    this.debug(`PATCH / `, this.root.name, session);
    return 'laudspeaker API v 1.0';
  }

  @UseInterceptors(new RavenInterceptor())
  @Delete('/webhook-delete-test')
  webhookDeleteTest(@Req() req: Request) {
    const session = randomUUID();
    this.log(JSON.stringify(req.body, null, 2), this.root.name, session);
    this.log(JSON.stringify(req.headers, null, 2), this.root.name, session);
    this.debug(`DELETE / `, this.root.name, session);
    return 'laudspeaker API v 1.0';
  }

  @UseInterceptors(new RavenInterceptor())
  @Get('/allowed')
  allowed() {
    const session = randomUUID();
    this.debug(`GET / `, this.root.name, session);
    const allowedRoutes = {};
    if (process.env.EMAIL_VERIFICATION !== 'true') {
      allowedRoutes['verified_not_allowed'] = true;
    }
    if (process.env.SLACK_ENABLED !== 'true') {
      allowedRoutes['slack_not_allowed'] = true;
    }
    return allowedRoutes;
  }
}
