import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import fs from 'fs';
import { randomUUID } from 'crypto';

@Injectable()
export class HealthCheckService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService
  ) {}

  log(message, method, session, user = 'ANONYMOUS') {
    this.logger.log(
      message,
      JSON.stringify({
        class: HealthCheckService.name,
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
        class: HealthCheckService.name,
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
        class: HealthCheckService.name,
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
        class: HealthCheckService.name,
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
        class: HealthCheckService.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async healthCheck() {
    const processType = (
      process.env.LAUDSPEAKER_PROCESS_TYPE ?? 'WEB'
    ).toLowerCase();
    const fileName = `laudspeaker-healthcheck-${processType}`;
    const filePath = `/tmp/${fileName}`;
    const fileContents = `${Date.now().toString()}\n`;

    const session = randomUUID();

    try {
      fs.writeFileSync(filePath, fileContents);
    } catch (err) {
      this.error(err, this.healthCheck.name, session);
    }
  }
}
