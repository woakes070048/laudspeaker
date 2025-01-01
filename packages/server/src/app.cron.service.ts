import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getType } from 'tst-reflect';
import { isDateString, isEmail } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Verification } from './api/auth/entities/verification.entity';
import { IntegrationsService } from './api/integrations/integrations.service';
import {
  Integration,
  IntegrationStatus,
} from './api/integrations/entities/integration.entity';
import { Recovery } from './api/auth/entities/recovery.entity';
import { WebhookJobsService } from './api/webhook-jobs/webhook-jobs.service';
import {
  WebhookJobStatus,
  WebhookProvider,
} from './api/webhook-jobs/entities/webhook-job.entity';
import { AccountsService } from './api/accounts/accounts.service';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import twilio from 'twilio';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import client from '@sendgrid/client';
import { ModalsService } from './api/modals/modals.service';
import { randomUUID } from 'crypto';
import { StepsService } from './api/steps/steps.service';
import { StepType } from './api/steps/types/step.interface';
import { Job, Queue } from 'bullmq';
import { JourneysService } from './api/journeys/journeys.service';
import { RedlockService } from './api/redlock/redlock.service';
import { Lock } from 'redlock';
import * as _ from 'lodash';
import { JourneyLocationsService } from './api/journeys/journey-locations.service';
import { Journey } from './api/journeys/entities/journey.entity';
import {
  EntryTiming,
  EntryTimingFrequency,
  RecurrenceEndsOptions,
} from './api/journeys/types/additional-journey-settings.interface';
import { OrganizationInvites } from './api/organizations/entities/organization-invites.entity';
import { JourneyLocation } from './api/journeys/entities/journey-location.entity';
import { Requeue } from './api/steps/entities/requeue.entity';
import { KEYS_TO_SKIP } from './utils/customer-key-name-validator';
import { SegmentsService } from './api/segments/segments.service';
import { CustomersService } from './api/customers/customers.service';
import { Temporal } from '@js-temporal/polyfill';
import { Account } from './api/accounts/entities/accounts.entity';
import * as os from 'os';
import * as Sentry from '@sentry/node';
import { QueueType } from './common/services/queue/types/queue-type';
import { Producer } from './common/services/queue/classes/producer';
import {
  ClickHouseTable,
  ClickHouseEventProvider,
  ClickHouseMessage,
  ClickHouseClient
} from './common/services/clickhouse';

const BATCH_SIZE = 500;

const generateUniqueJobId = (jobData) => {
  // Concatenate the unique identifiers
  const { ownerID, journeyID, customerID, step } = jobData;
  return `${ownerID}-${journeyID}-${customerID}-${step.id}`;
};

@Injectable()
export class CronService {
  constructor(
    private dataSource: DataSource,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    @InjectRepository(Integration)
    private integrationsRepository: Repository<Integration>,
    @InjectRepository(Verification)
    private verificationRepository: Repository<Verification>,
    @InjectRepository(Recovery)
    public readonly recoveryRepository: Repository<Recovery>,
    @InjectRepository(OrganizationInvites)
    public organizationInvitesRepository: Repository<OrganizationInvites>,
    @Inject(JourneysService) private journeysService: JourneysService,
    @Inject(SegmentsService) private segmentsService: SegmentsService,
    @Inject(CustomersService) private customersService: CustomersService,
    @Inject(IntegrationsService)
    private integrationsService: IntegrationsService,
    @Inject(WebhookJobsService) private webhookJobsService: WebhookJobsService,
    @Inject(AccountsService) private accountsService: AccountsService,
    @Inject(ModalsService) private modalsService: ModalsService,
    @Inject(StepsService) private stepsService: StepsService,
    @Inject(JourneyLocationsService)
    private journeyLocationsService: JourneyLocationsService,
    @Inject(RedlockService)
    private readonly redlockService: RedlockService,
    @Inject(ClickHouseClient)
    private clickhouseClient: ClickHouseClient,
  ) { }

  log(message, method, session, user = 'ANONYMOUS') {
    this.logger.log(
      message,
      JSON.stringify({
        class: CronService.name,
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
        class: CronService.name,
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
        class: CronService.name,
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
        class: CronService.name,
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
        class: CronService.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async minuteTasks() {
    return Sentry.startSpan({ name: 'CronService.minuteTasks' }, async () => {
      const session = randomUUID();
      // Time based steps
      let timeBasedErr: any;
      let queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const timeBasedJobs: any[] = [];
      try {
        const journeys = await this.journeysService.allActiveTransactional(
          queryRunner
        );
        for (
          let journeyIndex = 0;
          journeyIndex < journeys.length;
          journeyIndex++
        ) {
          const locations =
            await this.journeyLocationsService.findAllStaticCustomersInTimeBasedSteps(
              journeys[journeyIndex],
              session,
              queryRunner
            );
          for (
            let locationsIndex = 0;
            locationsIndex < locations.length;
            locationsIndex++
          ) {
            const step = await this.stepsService.findByID(
              String(locations[locationsIndex].step),
              session,
              null,
              queryRunner
            );
            let branch;
            // Set branch to -1 for wait until
            if (step.type === StepType.WAIT_UNTIL_BRANCH) {
              //Wait until time branch isnt set, continue
              if (!step.metadata.timeBranch) {
                continue;
              }
              branch = -1;
            }
            // Checking if enough time has elapsed to add step
            switch (step.type) {
              case StepType.WAIT_UNTIL_BRANCH:
                if (step.metadata.timeBranch.delay) {
                  if (
                    Date.now() - locations[locationsIndex].stepEntry <
                    Temporal.Duration.from(
                      step.metadata.timeBranch.delay
                    ).total({
                      unit: 'millisecond',
                    })
                  ) {
                    continue;
                  }
                } else if (step.metadata.timeBranch.window) {
                  // Case 1: days of the week/time of day
                  if (step.metadata.timeBranch.window.onDays) {
                    const now = new Date();

                    const startTime = new Date(now.getTime());
                    startTime.setHours(
                      step.metadata.timeBranch.window.fromTime.split(':')[0]
                    );
                    startTime.setMinutes(
                      step.metadata.timeBranch.window.fromTime.split(':')[1]
                    );

                    const endTime = new Date(now.getTime());
                    endTime.setHours(
                      step.metadata.timeBranch.window.toTime.split(':')[0]
                    );
                    endTime.setMinutes(
                      step.metadata.timeBranch.window.toTime.split(':')[1]
                    );

                    const day = now.getDay();

                    if (
                      !(
                        startTime < now &&
                        endTime > now &&
                        step.metadata.window.onDays[day] === 1
                      )
                    ) {
                      continue;
                    }
                  }
                  // Case2: Date and time of window
                  else {
                    if (
                      !(
                        new Date(
                          Temporal.Instant.from(
                            step.metadata.timeBranch.window.from
                          ).epochMilliseconds
                        ).getTime() < Date.now() &&
                        Date.now() <
                        new Date(
                          Temporal.Instant.from(
                            step.metadata.timeBranch.window.to
                          ).epochMilliseconds
                        ).getTime()
                      )
                    ) {
                      continue;
                    }
                  }
                }
                break;
              case StepType.TIME_WINDOW:
                // Case 1: Specific days of the week
                if (step.metadata.window.onDays) {
                  const now = new Date();

                  const startTime = new Date(now.getTime());
                  startTime.setHours(
                    step.metadata.window.fromTime.split(':')[0]
                  );
                  startTime.setMinutes(
                    step.metadata.window.fromTime.split(':')[1]
                  );

                  const endTime = new Date(now.getTime());
                  endTime.setHours(step.metadata.window.toTime.split(':')[0]);
                  endTime.setMinutes(step.metadata.window.toTime.split(':')[1]);

                  const day = now.getDay();

                  this.warn(
                    JSON.stringify({ day, startTime, endTime, now, step }),
                    this.minuteTasks.name,
                    session
                  );

                  if (
                    !(
                      startTime < now &&
                      endTime > now &&
                      step.metadata.window.onDays[day] === 1
                    )
                  ) {
                    continue;
                  }
                }
                // Case2: Date and time of window
                else {
                  if (
                    !(
                      new Date(
                        Temporal.Instant.from(
                          step.metadata.window.from
                        ).epochMilliseconds
                      ).getTime() < Date.now() &&
                      Date.now() <
                      new Date(
                        Temporal.Instant.from(
                          step.metadata.window.to
                        ).epochMilliseconds
                      ).getTime()
                    )
                  ) {
                    continue;
                  }
                }
                break;
              case StepType.TIME_DELAY:
                if (
                  Date.now() - locations[locationsIndex].stepEntry <
                  Temporal.Duration.from(step.metadata.delay).total({
                    unit: 'millisecond',
                  })
                ) {
                  continue;
                }
                break;
              default:
                break;
            }
            try {
              await this.journeyLocationsService.lock(
                locations[locationsIndex],
                session,
                undefined,
                queryRunner
              );
              timeBasedJobs.push({
                name: String(step.type),
                data: {
                  step: step,
                  owner:
                    await this.accountsService.findOrganizationOwnerByWorkspaceId(
                      step.workspace.id,
                      session
                    ),
                  session: session,
                  journey: journeys[journeyIndex],
                  customer: await this.customersService.findByCustomerIdUnauthenticated(locations[locationsIndex].customer.id.toString()),
                  location: locations[locationsIndex],
                  branch,
                  // TODO: extrapolate stepDepth from journey
                  stepDepth: 1,
                },
                // These opts will be ignored
                opts: {
                  jobId: generateUniqueJobId({
                    step: step,
                    ownerID: step.workspace.organization.owner.id,
                    journeyID: journeys[journeyIndex].id,
                    customerID: locations[locationsIndex].customer,
                  }),
                },
              });
            } catch (e) {
              this.warn(
                `Encountered error handling time based steps`,
                this.minuteTasks.name,
                session
              );
              this.error(e, this.minuteTasks.name, session);
            }
          }
        }
        await queryRunner.commitTransaction();
      } catch (e) {
        timeBasedErr = e;
        this.warn(
          `Encountered error handling time based steps`,
          this.minuteTasks.name,
          session
        );
        this.error(e, this.minuteTasks.name, session);
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }
      if (!timeBasedErr) {
        const jobDataFilter = (type, jobs): any[] => {
          let filteredJobs = jobs.filter((job) => {
            return job.name === String(type);
          });

          filteredJobs = filteredJobs.map((job) => job.data);

          return filteredJobs;
        };
        const waitUntilJobsData = jobDataFilter(
          StepType.WAIT_UNTIL_BRANCH,
          timeBasedJobs
        );
        const timeDelayJobsData = jobDataFilter(
          StepType.TIME_DELAY,
          timeBasedJobs
        );
        const timeWindowJobsData = jobDataFilter(
          StepType.TIME_WINDOW,
          timeBasedJobs
        );

        await Producer.addBulk(
          QueueType.WAIT_UNTIL_STEP,
          waitUntilJobsData
        );
        await Producer.addBulk(
          QueueType.TIME_DELAY_STEP,
          timeDelayJobsData);
        await Producer.addBulk(
          QueueType.TIME_WINDOW_STEP,
          timeWindowJobsData
        );
      }

      // Handle expiry of recovery emails
      let recoveryErr: any;
      try {
        await this.recoveryRepository
          .createQueryBuilder()
          .where(`now() > recovery."createdAt"::TIMESTAMP + INTERVAL '1 HOUR'`)
          .delete()
          .execute();
      } catch (e) {
        recoveryErr = e;
        this.warn(
          `Encountered error handling expiry of recovery emails`,
          this.minuteTasks.name,
          session
        );
        this.error(e, this.minuteTasks.name, session);
      }

      // Handle organization invte expiry
      let orgInviteErr: any;
      try {
        await this.organizationInvitesRepository
          .createQueryBuilder()
          .where(
            `now() > organization_invites."createdAt"::TIMESTAMP + INTERVAL '1 DAY'`
          )
          .delete()
          .execute();
      } catch (e) {
        orgInviteErr = e;
        this.warn(
          `Encountered error handling expiry of organization invites`,
          this.minuteTasks.name,
          session
        );
        this.error(e, this.minuteTasks.name, session);
      }

      // Handle requeueing messages for quiet hours/rate limiting
      let requeueErr: any;
      queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const requeuedMessages = await this.stepsService.getRequeuedMessages(
          session,
          queryRunner
        );
        const bulkJobs: any[] = [];
        for (const requeue of requeuedMessages) {
          // THIS MIGHT BE SLOWER THAN WE WANT querying for the customer.
          // findAndLock only uses customer.id, but the function currently
          // only accepts the whole customer document. Consider changing
          const customer = await this.customersService.findByCustomerIdUnauthenticated(
            requeue.customerId,
            undefined
          );
          await this.journeyLocationsService.findAndLock(
            requeue.step.journey,
            customer,
            session,
            requeue?.workspace?.organization?.owner,
            queryRunner
          );
          await bulkJobs.push({
            owner: requeue.workspace?.organization?.owner,
            journey: requeue.step.journey,
            step: requeue.step,
            session,
            customerID: requeue.customerId,
          });
          await queryRunner.manager.remove(requeue);
        }
        await Producer.addBulk(QueueType.MESSAGE_STEP,
          bulkJobs,
          StepType.MESSAGE)
        await queryRunner.commitTransaction();
      } catch (e) {
        requeueErr = e;
        this.warn(
          `Encountered error requeueing messages`,
          this.minuteTasks.name,
          session
        );
        this.error(e, this.minuteTasks.name, session);
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleVerificationCheck() {
    return Sentry.startSpan(
      { name: 'CronService.handleVerificationCheck' },
      async () => {
        const session = randomUUID();
        try {
          await this.verificationRepository
            .createQueryBuilder()
            .where(
              `verification.status = 'sent' AND now() > verification."createdAt"::TIMESTAMP + INTERVAL '1 HOUR'`
            )
            .update({ status: 'expired' })
            .execute();
        } catch (e) {
          this.error(e, this.handleVerificationCheck.name, session);
        }
      }
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleIntegrations() {
    return Sentry.startSpan(
      { name: 'CronService.handleIntegrations' },
      async () => {
        const integrationsNumber = await this.integrationsRepository.countBy({
          status: IntegrationStatus.ACTIVE,
        });

        let offset = 0;

        while (offset < integrationsNumber) {
          const integrationsBatch = await this.integrationsRepository.find({
            where: { status: IntegrationStatus.ACTIVE },
            relations: ['database', 'owner'],
            take: BATCH_SIZE,
            skip: offset,
          });

          for (const integration of integrationsBatch) {
            await this.integrationsService.handleIntegration(integration);
          }

          offset += BATCH_SIZE;
        }
      }
    );
  }

  /*
   * helper function that deletes
   *
   */

  checkSegmentHasMessageFilters(
    segmentCriteria: any,
    orgId: string,
    session: string
  ): boolean {
    // Convert the segmentCriteria object to a JSON string
    const criteriaString = JSON.stringify(segmentCriteria);

    // Check for the presence of any of the specified types in the string
    return /"type":\s*"(Email|Push|In-app message|SMS)"/.test(criteriaString);
  }
  /*
   *
   * Function goes through all dyanmic segments, and finds
   * those with message filters, and updates segment membership
   * with users (add, remove) based on message events
   * then updates message events to say they have been processed
   *
   * to do
   *
   *
   * this could theoretically be optimized if we wrote a function
   * that does incremental segment addition and removal instead of
   * complete recalculation. ie takes segment criteria and only looks
   * at clickhouse unprocessed events
   *
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async updateStatementsWithMessageEvents() {
    return Sentry.startSpan(
      { name: 'CronService.updateStatementsWithMessageEvents' },
      async () => {
        const session = randomUUID();
        let err;
        //console.log("about to run updateStatementsWithMessageEvents");
        // for each organization, get all segments
        // to do change this to organisations rather than
        const accounts = await this.accountsService.findAll();
        for (let j = 0; j < accounts.length; j++) {
          const queryRunner = this.dataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();
          const segmentPrefixes: string[] = [];
          //we keep for logging
          let segmentError: string;
          try {
            const segments = await this.segmentsService.getSegments(
              accounts[j],
              undefined,
              queryRunner
            );
            // for each segment check if it has a message component
            for (const segment of segments) {
              if (
                !segment.inclusionCriteria ||
                !segment.inclusionCriteria.query
              ) {
                continue; // Skip to the next iteration of the loop
              }

              const doInclude = this.checkSegmentHasMessageFilters(
                segment.inclusionCriteria.query,
                accounts[j].id,
                session
              );
              this.debug(
                `we updated doInclude: ${doInclude}`,
                this.updateStatementsWithMessageEvents.name,
                session,
                accounts[j].id
              );
              if (doInclude) {
                // If segment includes message filters recalculate which customers should be in the segment
                const collectionPrefix =
                  this.segmentsService.generateRandomString();
                segmentError = segment.name;
                this.debug(
                  `segment is: ${segment}`,
                  this.updateStatementsWithMessageEvents.name,
                  session,
                  accounts[j].id
                );
                this.debug(
                  `chron prefix for segment is: ${collectionPrefix}`,
                  this.updateStatementsWithMessageEvents.name,
                  session,
                  accounts[j].id
                );
                segmentPrefixes.push(collectionPrefix);
                const customersInSegment =
                  await this.customersService.getSegmentCustomersFromQuery(
                    segment.inclusionCriteria.query,
                    accounts[j],
                    session,
                    true,
                    0,
                    collectionPrefix
                  );

                this.debug(
                  `we have customersInSegment: ${customersInSegment}`,
                  this.updateStatementsWithMessageEvents.name,
                  session,
                  accounts[j].id
                );
                // update the segment customer table
                //try {
                //collectionName: string,account: Account,segmentId: string,session: string,queryRunner: QueryRunner,batchSize: number = 500 //
                await this.segmentsService.updateSegmentCustomersBatched(
                  customersInSegment,
                  accounts[j],
                  segment.id,
                  session,
                  queryRunner,
                  500
                );
              }
            }
            await queryRunner.commitTransaction();
          } catch (error) {
            this.debug(
              `error updating segment: ${segmentError}`,
              this.updateStatementsWithMessageEvents.name,
              session,
              accounts[j].id
            );
            this.error(
              error,
              this.updateStatementsWithMessageEvents.name,
              session,
              accounts[j].id
            );
            //drop extraneous collections in case of error
            await queryRunner.rollbackTransaction();
            err = error;
          } finally {
            await queryRunner.release();
          }
        }
      }
    );
  }

  // @Cron(CronExpression.EVERY_DAY_AT_NOON)
  // async handleMissedMailgunEvents() {
  //   const session = randomUUID();
  //   try {
  //     // Get all pending Mailgun Jobs and accounts
  //     const mailgunJobs = await this.webhookJobsService.findAllByProvider(
  //       WebhookProvider.MAILGUN
  //     );
  //     const accounts = await this.accountsService.findAll();

  //     // Create new pending Mailgun Job
  //     await this.webhookJobsService.create({
  //       provider: WebhookProvider.MAILGUN,
  //       status: WebhookJobStatus.PENDING,
  //     });

  //     // Iterate through Jobs
  //     for (let i = 0; i < mailgunJobs.length; i++) {
  //       const startTime = mailgunJobs[i].createdAt;

  //       // Update job status
  //       await this.webhookJobsService.update(mailgunJobs[i].id, {
  //         status: WebhookJobStatus.IN_PROGRESS,
  //       });

  //       //Iterate through accounts
  //       for (let j = 0; j < accounts.length; j++) {
  //         if (
  //           accounts[j]?.teams?.[0]?.organization?.workspaces?.[0]
  //             .mailgunAPIKey &&
  //           accounts[j]?.teams?.[0]?.organization?.workspaces?.[0].sendingDomain
  //         ) {
  //           const mailgun = new Mailgun(formData);
  //           const mg = mailgun.client({
  //             username: 'api',
  //             key: accounts[j]?.teams?.[0]?.organization?.workspaces?.[0]
  //               .mailgunAPIKey,
  //           });
  //           let query, events;
  //           query = {
  //             begin: startTime.toUTCString(),
  //             limit: 300,
  //             ascending: 'yes',
  //           };
  //           do {
  //             events = await mg.events.get(
  //               accounts[j]?.teams?.[0]?.organization?.workspaces?.[0]
  //                 ?.sendingDomain,
  //               query
  //             );
  //             for (let k = 0; k < events.items.length; k++) {
  //               const existsCheck = await this.clickHouseClient.query({
  //                 query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event = {event:String} AND messageId = {messageId:String}`,
  //                 query_params: {
  //                   event: events.items[k].event,
  //                   messageId: events.items[k].message.headers['message-id'],
  //                 },
  //               });
  //               const existsRows = JSON.parse(await existsCheck.text());
  //               if (existsRows.data.length == 0) {
  //                 const messageInfo = await this.clickHouseClient.query({
  //                   query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE messageId = {messageId:String} AND audienceId IS NOT NULL AND customerId IS NOT NULL AND templateId IS NOT NULL LIMIT 1`,
  //                   query_params: {
  //                     messageId: events.items[k].message.headers['message-id'],
  //                   },
  //                 });
  //                 const messageRow = JSON.parse(await messageInfo.text()).data;
  //                 const messagesToInsert: ClickHouseMessage[] = [];
  //                 const clickHouseRecord: ClickHouseMessage = {
  //                   workspaceId:
  //                     accounts[j]?.teams?.[0]?.organization?.workspaces?.[0].id,
  //                   audienceId: messageRow[0]?.audienceId,
  //                   customerId: messageRow[0]?.customerId,
  //                   templateId: messageRow[0]?.templateId,
  //                   messageId: events.items[k].message.headers['message-id'],
  //                   event: events.items[k].event,
  //                   eventProvider: ClickHouseEventProvider.MAILGUN,
  //                   createdAt: new Date(
  //                     events.items[k].timestamp * 1000
  //                   ).toISOString(),
  //                   processed: false,
  //                 };
  //                 messagesToInsert.push(clickHouseRecord);
  //                 await this.clickHouseClient.insert<ClickHouseMessage>({
  //                   table: ${ClickHouseTable.MESSAGE_STATUS},
  //                   values: messagesToInsert,
  //                   format: 'JSONEachRow',
  //                 });
  //               }
  //             }
  //             query = { page: events.pages.next.number };
  //           } while (events?.items?.length > 0 && query.page);
  //         }
  //       }
  //       await this.webhookJobsService.remove(mailgunJobs[i].id);
  //     }
  //   } catch (err) {
  //     this.error(err, this.handleMissedMailgunEvents.name, session);
  //   }
  // }

  // @Cron(CronExpression.EVERY_DAY_AT_NOON)
  // async handleMissedSendgridEvents() {
  //   const session = randomUUID();
  //   try {
  //     // Get all pending Twilio Jobs and accounts
  //     const sendgridJobs = await this.webhookJobsService.findAllByProvider(
  //       WebhookProvider.SENDGRID
  //     );
  //     const accounts = await this.accountsService.findAll();

  //     // Create new pending Twilio Job
  //     await this.webhookJobsService.create({
  //       provider: WebhookProvider.SENDGRID,
  //       status: WebhookJobStatus.PENDING,
  //     });

  //     // Iterate through Jobs
  //     for (let i = 0; i < sendgridJobs.length; i++) {
  //       // Update job status
  //       await this.webhookJobsService.update(sendgridJobs[i].id, {
  //         status: WebhookJobStatus.IN_PROGRESS,
  //       });

  //       //Iterate through accounts
  //       for (let j = 0; j < accounts.length; j++) {
  //         if (
  //           accounts[j].teams?.[0]?.organization?.workspaces?.[0].sendgridApiKey
  //         ) {
  //           client.setApiKey(
  //             accounts[j].teams?.[0]?.organization?.workspaces?.[0]
  //               .sendgridApiKey
  //           );
  //           const resultSet = await this.clickHouseClient.query({
  //             query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE processed = false AND eventProvider = 'sendgrid' AND workspaceId = {workspaceId:String}`,
  //             query_params: {
  //               workspaceId:
  //                 accounts[j].teams?.[0]?.organization?.workspaces?.[0].id,
  //             },
  //             format: 'JSONEachRow',
  //           });
  //           for await (const rows of resultSet.stream()) {
  //             rows.forEach(async (row) => {
  //               const rowObject = JSON.parse(row.text);
  //               // Step 1: Check if the message has already reached an end state: delivered, undelivered, failed, canceled
  //               const existsCheck = await this.clickHouseClient.query({
  //                 query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event IN ('dropped', 'bounce', 'blocked', 'open', 'click', 'spamreport', 'unsubscribe','group_unsubscribe','group_resubscribe') AND messageId = {messageId:String}`,
  //                 query_params: { messageId: rowObject.messageId },
  //               });
  //               const existsRows = JSON.parse(await existsCheck.text());

  //               // If not reached end state, check if reached end state using API
  //               if (existsRows.data.length === 0) {
  //                 let message;
  //                 try {
  //                   const response: any = await client.request({
  //                     url: `/v3/messages`,
  //                     method: 'GET',
  //                     qs: {
  //                       query: `msg_id=${rowObject.messageId}`,
  //                     },
  //                   });
  //                   message = response.body.messages[0];
  //                 } catch (err) {
  //                   // User is unauthorized to use events api, so we return
  //                   return;
  //                 }

  //                 // Reached end state using API; update end state and set as processed in clickhouse
  //                 if (
  //                   ['delivered', 'dropped', 'bounce', 'blocked'].includes(
  //                     message.status
  //                   )
  //                 ) {
  //                   const messagesToInsert: ClickHouseMessage[] = [];
  //                   const clickHouseRecord: ClickHouseMessage = {
  //                     audienceId: rowObject.audienceId,
  //                     customerId: rowObject.customerId,
  //                     templateId: rowObject.templateId,
  //                     messageId: rowObject.messageId,
  //                     event: message.status,
  //                     eventProvider: ClickHouseEventProvider.TWILIO,
  //                     createdAt: new Date().toISOString(),
  //                     workspaceId:
  //                       accounts[j].teams?.[0]?.organization?.workspaces?.[0]
  //                         ?.id,
  //                     processed: false,
  //                   };
  //                   messagesToInsert.push(clickHouseRecord);
  //                   await this.clickHouseClient.insert<ClickHouseMessage>({
  //                     table: ${ClickHouseTable.MESSAGE_STATUS},
  //                     values: messagesToInsert,
  //                     format: 'JSONEachRow',
  //                   });
  //                   await this.clickHouseClient.query({
  //                     query: `ALTER TABLE ${ClickHouseTable.MESSAGE_STATUS} UPDATE processed=true WHERE eventProvider='sendgrid' AND event = 'sent' AND messageId = {messageId:String} AND templateId = {templateId:String} AND customerId = {customerId:String} AND audienceId = {audienceId:String}`,
  //                     query_params: {
  //                       messageId: rowObject.messageId,
  //                       templateId: rowObject.templateId,
  //                       customerId: rowObject.customerId,
  //                       audienceId: rowObject.audienceId,
  //                     },
  //                   });
  //                 }
  //                 //Has not reached end state; do nothing
  //               }
  //               // Has reached end state using webhooks; update processed = true
  //               else {
  //                 await this.clickHouseClient.query({
  //                   query: `ALTER TABLE ${ClickHouseTable.MESSAGE_STATUS} UPDATE processed=true WHERE eventProvider='sendgrid' AND event = 'sent' AND messageId = {messageId:String} AND templateId = {templateId:String} AND customerId = {customerId:String} AND audienceId = {audienceId:String}`,
  //                   query_params: {
  //                     messageId: rowObject.messageId,
  //                     templateId: rowObject.templateId,
  //                     customerId: rowObject.customerId,
  //                     audienceId: rowObject.audienceId,
  //                   },
  //                 });
  //               }
  //             });
  //           }
  //         }
  //       }
  //       await this.webhookJobsService.remove(sendgridJobs[i].id);
  //     }
  //   } catch (err) {
  //     this.error(err, this.handleMissedSendgridEvents.name, session);
  //   }
  // }

  // @Cron(CronExpression.EVERY_DAY_AT_NOON)
  // async handleMissedTwilioEvents() {
  //   const session = randomUUID();
  //   try {
  //     // Get all pending Twilio Jobs and accounts
  //     const twilioJobs = await this.webhookJobsService.findAllByProvider(
  //       WebhookProvider.TWILIO_SMS
  //     );
  //     const accounts = await this.accountsService.findAll();

  //     // Create new pending Twilio Job
  //     await this.webhookJobsService.create({
  //       provider: WebhookProvider.TWILIO_SMS,
  //       status: WebhookJobStatus.PENDING,
  //     });

  //     // Iterate through Jobs
  //     for (let i = 0; i < twilioJobs.length; i++) {
  //       // Update job status
  //       await this.webhookJobsService.update(twilioJobs[i].id, {
  //         status: WebhookJobStatus.IN_PROGRESS,
  //       });

  //       //Iterate through accounts
  //       for (let j = 0; j < accounts.length; j++) {
  //         const workspace =
  //           accounts[j].teams?.[0]?.organization?.workspaces?.[0];
  //         if (workspace.smsAccountSid && workspace.smsAuthToken) {
  //           const twilioClient = twilio(
  //             workspace.smsAccountSid,
  //             workspace.smsAuthToken
  //           );
  //           const resultSet = await this.clickHouseClient.query({
  //             query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE processed = false AND eventProvider = 'twilio' AND workspaceId = {workspaceId:String}`,
  //             query_params: {
  //               workspaceId:
  //                 accounts[j].teams?.[0]?.organization?.workspaces?.[0]?.id,
  //             },
  //             format: 'JSONEachRow',
  //           });
  //           for await (const rows of resultSet.stream()) {
  //             rows.forEach(async (row) => {
  //               const rowObject = JSON.parse(row.text);
  //               // Step 1: Check if the message has already reached an end state: delivered, undelivered, failed, canceled
  //               const existsCheck = await this.clickHouseClient.query({
  //                 query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event IN ('delivered', 'undelivered', 'failed', 'canceled') AND messageId = {messageId:String}`,
  //                 query_params: { messageId: rowObject.messageId },
  //               });
  //               const existsRows = JSON.parse(await existsCheck.text());
  //               if (existsRows.data.length === 0) {
  //                 const message = await twilioClient
  //                   .messages(rowObject.messageId)
  //                   .fetch();
  //                 if (
  //                   ['delivered', 'undelivered', 'failed', 'canceled'].includes(
  //                     message.status
  //                   )
  //                 ) {
  //                   const messagesToInsert: ClickHouseMessage[] = [];
  //                   const clickHouseRecord: ClickHouseMessage = {
  //                     audienceId: rowObject.audienceId,
  //                     customerId: rowObject.customerId,
  //                     templateId: rowObject.templateId,
  //                     messageId: rowObject.messageId,
  //                     event: message.status,
  //                     eventProvider: ClickHouseEventProvider.TWILIO,
  //                     createdAt: new Date().toISOString(),
  //                     workspaceId:
  //                       accounts[j].teams?.[0]?.organization?.workspaces?.[0]
  //                         .id,
  //                     processed: false,
  //                   };
  //                   messagesToInsert.push(clickHouseRecord);
  //                   await this.clickHouseClient.insert<ClickHouseMessage>({
  //                     table: ${ClickHouseTable.MESSAGE_STATUS},
  //                     values: messagesToInsert,
  //                     format: 'JSONEachRow',
  //                   });
  //                   await this.clickHouseClient.query({
  //                     query: `ALTER TABLE ${ClickHouseTable.MESSAGE_STATUS} UPDATE processed=true WHERE eventProvider='twilio' AND event = 'sent' AND messageId = {messageId:String} AND templateId = {templateId:String} AND customerId = {customerId:String} AND audienceId = {audienceId:String}`,
  //                     query_params: {
  //                       messageId: rowObject.messageId,
  //                       templateId: rowObject.templateId,
  //                       customerId: rowObject.customerId,
  //                       audienceId: rowObject.audienceId,
  //                     },
  //                   });
  //                 }
  //               } else {
  //                 await this.clickHouseClient.query({
  //                   query: `ALTER TABLE ${ClickHouseTable.MESSAGE_STATUS} UPDATE processed=true WHERE eventProvider='twilio' AND event = 'sent' AND messageId = {messageId:String} AND templateId = {templateId:String} AND customerId = {customerId:String} AND audienceId = {audienceId:String}`,
  //                   query_params: {
  //                     messageId: rowObject.messageId,
  //                     templateId: rowObject.templateId,
  //                     customerId: rowObject.customerId,
  //                     audienceId: rowObject.audienceId,
  //                   },
  //                 });
  //               }
  //             });
  //           }
  //         }
  //       }
  //       await this.webhookJobsService.remove(twilioJobs[i].id);
  //     }
  //   } catch (err) {
  //     this.error(err, this.handleMissedTwilioEvents.name, session);
  //   }
  // }

  // @Cron(CronExpression.EVERY_MINUTE)
  // async handleExpiredModalEvents() {
  //   const session = randomUUID();
  //   try {
  //     await this.modalsService.deleteExpiredModalEvents();
  //   } catch (e) {
  //     this.error(e, this.handleExpiredModalEvents.name, session);
  //   }
  // }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanTrashSteps() {
    return Sentry.startSpan(
      { name: 'CronService.cleanTrashSteps' },
      async () => {
        const session = randomUUID();
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        this.log(
          'Start cleaning unused steps',
          this.cleanTrashSteps.name,
          session
        );
        try {
          const data = await queryRunner.query(`
            WITH active_journeys AS (
              SELECT id, "visualLayout"
              FROM journey
              WHERE "isActive" = true or "isPaused" = true or "isStopped" = true or "isDeleted" = true
          )

          , step_ids_to_keep AS (
              SELECT 
                  aj.id as journey_id,
                  (node->'data'->>'stepId')::uuid as step_id
              FROM active_journeys aj
              CROSS JOIN LATERAL jsonb_array_elements("visualLayout"->'nodes') as node
              WHERE node->'data' ? 'stepId'
          )

          DELETE FROM step s
          WHERE s."journeyId" IN (SELECT id FROM active_journeys)
          AND (s."journeyId", s.id) NOT IN (SELECT journey_id, step_id FROM step_ids_to_keep);
        `);
          await queryRunner.commitTransaction();
          this.log(
            `Finish cleaning unused steps, removed: ${data[1]}`,
            this.cleanTrashSteps.name,
            session
          );
        } catch (e) {
          await queryRunner.rollbackTransaction();
          this.error(e, this.cleanTrashSteps.name, session);
        } finally {
          await queryRunner.release();
        }
      }
    );
  }

  /*
   * Helper for clean up
   */
  async deleteCollectionIfNeeded(collectionName) {
    if (collectionName.includes('_FullDetails')) {
      // Remove '_FullDetails' from the collection name
      const modifiedCollectionName = collectionName.replace('_FullDetails', '');
    } else {
      // If '_FullDetails' is not part of the name, use the original collection name
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleEntryTiming() {
    return Sentry.startSpan(
      { name: 'CronService.handleEntryTiming' },
      async () => {
        const session = randomUUID();
        let triggerStartTasks;
        const queryRunner = this.dataSource.createQueryRunner();
        const client = await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
          // Step 1: Find all journeys that are delayed
          const delayedJourneys = await queryRunner.manager
            .createQueryBuilder(Journey, 'journey')
            .leftJoinAndSelect('journey.workspace', 'workspace') // Assuming 'owner' is the relation property in the Journey entity
            .leftJoinAndSelect('workspace.organization', 'organization') // Assuming 'owner' is the relation property in the Journey entity
            .leftJoinAndSelect('organization.owner', 'account') // Assuming 'owner' is the relation property in the Journey entity
            .leftJoinAndSelect('account.teams', 'teams') // Assuming 'owner' is the relation property in the Journey entity
            .leftJoinAndSelect('teams.organization', 'organization_two') // Assuming 'owner' is the relation property in the Journey entity
            .leftJoinAndSelect('organization_two.workspaces', 'workspaces') // Assuming 'owner' is the relation property in the Journey entity
            .where(
              'journey."journeyEntrySettings"->\'entryTiming\'->>\'type\' = :type AND journey."isActive" = true',
              {
                type: EntryTiming.SpecificTime,
              }
            )
            .getMany();
          // Step 2: Filter all journeys that are eligible to be re-enrolled
          for (
            let journeysIndex = 0;
            journeysIndex < delayedJourneys.length;
            journeysIndex++
          ) {
            let enroll = false;
            if (
              delayedJourneys[journeysIndex].journeyEntrySettings?.entryTiming
                .time.frequency === EntryTimingFrequency.Once
            ) {
              if (
                new Date(
                  delayedJourneys[
                    journeysIndex
                  ].journeyEntrySettings?.entryTiming.time.startDate
                ).getTime() < Date.now() &&
                +delayedJourneys[journeysIndex].enrollment_count === 0
              ) {
                enroll = true;
              }
            } else if (
              delayedJourneys[journeysIndex].journeyEntrySettings?.entryTiming
                .time.recurrence.endsOn === RecurrenceEndsOptions.After &&
              +delayedJourneys[journeysIndex].journeyEntrySettings?.entryTiming
                .time.recurrence.endAdditionalValue <=
              delayedJourneys[journeysIndex].enrollment_count - 1
            ) {
              continue;
            } else if (
              delayedJourneys[journeysIndex].journeyEntrySettings?.entryTiming
                .time.recurrence.endsOn ===
              RecurrenceEndsOptions.SpecificDate &&
              new Date(
                delayedJourneys[
                  journeysIndex
                ].journeyEntrySettings?.entryTiming.time.recurrence.endAdditionalValue
              ).getTime() <= Date.now()
            ) {
              continue;
            } else {
              // TODO: Recurring enrollment
            }
            if (enroll) {
              this.log(
                `Starting enrollment for journey ${delayedJourneys[journeysIndex].id}`,
                this.handleEntryTiming.name,
                session
              );
              const { collectionName, count } =
                await this.customersService.getAudienceSize(
                  delayedJourneys[journeysIndex].workspace.organization.owner,
                  delayedJourneys[journeysIndex].inclusionCriteria,
                  session,
                );
              // if (collectionName) collectionNames.push(collectionName);
              // Step 3: Edit journey details
              await queryRunner.manager.save(Journey, {
                ...delayedJourneys[journeysIndex],
                enrollment_count:
                  delayedJourneys[journeysIndex].enrollment_count + 1,
                last_enrollment_timestamp: Date.now(),
              });
              // Step 4: Reenroll customers that have been unenrolled
              const accountWithConnections: Account =
                await queryRunner.manager.findOne(Account, {
                  where: {
                    id: delayedJourneys[journeysIndex].workspace.organization
                      .owner.id,
                  },
                  relations: [
                    'teams.organization.workspaces',
                    'teams.organization.workspaces.mailgunConnections.sendingOptions',
                    'teams.organization.workspaces.sendgridConnections.sendingOptions',
                    'teams.organization.workspaces.resendConnections.sendingOptions',
                    'teams.organization.workspaces.twilioConnections',
                    'teams.organization.workspaces.pushConnections',
                  ],
                });
              triggerStartTasks = await this.stepsService.triggerStart(
                accountWithConnections,
                delayedJourneys[journeysIndex],
                delayedJourneys[journeysIndex].inclusionCriteria,
                // delayedJourneys[journeysIndex]?.journeySettings?.maxEntries
                //   ?.enabled &&
                //   count >
                //   parseInt(
                //     delayedJourneys[journeysIndex]?.journeySettings
                //       ?.maxEntries?.maxEntries
                //   )
                //   ? parseInt(
                //     delayedJourneys[journeysIndex]?.journeySettings
                //       ?.maxEntries?.maxEntries
                //   )
                //   : count,
                // queryRunner,
                // client,
                session,
                // collectionName
              );
              // drop the collections after adding customer segments
              await this.deleteCollectionIfNeeded(collectionName);
            }
          }
          await queryRunner.commitTransaction();
          // for (const collection of collectionNames) {
          //   await this.connection.dropCollection(collection);
          // }
          if (triggerStartTasks?.jobData)
            await Producer.add(
              QueueType.START,
              triggerStartTasks.jobData
            );
        } catch (e) {
          this.error(e, this.handleEntryTiming.name, session);
          await queryRunner.rollbackTransaction();
        } finally {
          await queryRunner.release();
        }
      }
    );
  }
}

// /*
// import { Inject, Injectable, LoggerService } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import {
//   Customer,
//   CustomerDocument,
// } from './api/customers/schemas/customer.schema';
// import { getType } from 'tst-reflect';
// import {
//   CustomerKeys,
//   CustomerKeysDocument,
// } from './api/customers/schemas/customer-keys.schema';
// import { isDateString, isEmail } from 'class-validator';
// import { InjectRepository } from '@nestjs/typeorm';
// import { DataSource, Repository } from 'typeorm';
// import { Verification } from './api/auth/entities/verification.entity';
// import { EventDocument } from './api/events/schemas/event.schema';
// import { EventKeysDocument } from './api/events/schemas/event-keys.schema';
// import { Event } from './api/events/schemas/event.schema';
// import { EventKeys } from './api/events/schemas/event-keys.schema';
// import { IntegrationsService } from './api/integrations/integrations.service';
// import {
//   Integration,
//   IntegrationStatus,
// } from './api/integrations/entities/integration.entity';
// import { Recovery } from './api/auth/entities/recovery.entity';
// import { WebhookJobsService } from './api/webhook-jobs/webhook-jobs.service';
// import { AccountsService } from './api/accounts/accounts.service';
// import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
// import { ModalsService } from './api/modals/modals.service';
// import { randomUUID } from 'crypto';
// import { StepsService } from './api/steps/steps.service';
// import { StepType } from './api/steps/types/step.interface';
// import { InjectQueue } from '@nestjs/bullmq';
// import { Queue } from 'bullmq';
// import { JourneysService } from './api/journeys/journeys.service';
// import { RedlockService } from './api/redlock/redlock.service';
// import * as _ from 'lodash';
// import { JourneyLocationsService } from './api/journeys/journey-locations.service';
// import { Journey } from './api/journeys/entities/journey.entity';
// import {
//   EntryTiming,
//   EntryTimingFrequency,
//   RecurrenceEndsOptions,
// } from './api/journeys/types/additional-journey-settings.interface';
// import { OrganizationInvites } from './api/organizations/entities/organization-invites.entity';
// import { JourneyLocation } from './api/journeys/entities/journey-location.entity';
// import { Requeue } from './api/steps/entities/requeue.entity';
// import { KEYS_TO_SKIP } from './utils/customer-key-name-validator';
// import { SegmentsService } from './api/segments/segments.service';
// import { CustomersService } from './api/customers/customers.service';
// import { Temporal } from '@js-temporal/polyfill';
// import { ProcessManagementService } from './api/process-management/process-management.service';
// import { Step } from './api/steps/entities/step.entity';
// import * as os from 'os';

// const BATCH_SIZE = 500;

// const generateUniqueJobId = (jobData) => {
//   // Concatenate the unique identifiers
//   const { ownerID, journeyID, customerID, step } = jobData;
//   return `${ownerID}-${journeyID}-${customerID}-${step.id}`;
// };

// @Injectable()
// export class CronService {
//   constructor(
//     private dataSource: DataSource,
//     @Inject(WINSTON_MODULE_NEST_PROVIDER)
//     private readonly logger: LoggerService,
//     @InjectModel(Customer.name)
//     private customerModel: Model<CustomerDocument>,
//     @InjectModel(CustomerKeys.name)
//     private customerKeysModel: Model<CustomerKeysDocument>,
//     @InjectModel(Event.name)
//     private eventModel: Model<EventDocument>,
//     @InjectModel(EventKeys.name)
//     private eventKeysModel: Model<EventKeysDocument>,
//     @InjectRepository(Integration)
//     private integrationsRepository: Repository<Integration>,
//     @InjectRepository(Verification)
//     private verificationRepository: Repository<Verification>,
//     @InjectRepository(Recovery)
//     public readonly recoveryRepository: Repository<Recovery>,
//     @InjectRepository(OrganizationInvites)
//     public organizationInvitesRepository: Repository<OrganizationInvites>,
//     @Inject(JourneysService) private journeysService: JourneysService,
//     @Inject(SegmentsService) private segmentsService: SegmentsService,
//     @Inject(CustomersService) private customersService: CustomersService,
//     @Inject(IntegrationsService)
//     private integrationsService: IntegrationsService,
//     @Inject(WebhookJobsService) private webhookJobsService: WebhookJobsService,
//     @Inject(AccountsService) private accountsService: AccountsService,
//     @Inject(ModalsService) private modalsService: ModalsService,
//     @Inject(StepsService) private stepsService: StepsService,
//     @Inject(JourneyLocationsService)
//     private journeyLocationsService: JourneyLocationsService,
//     @InjectQueue('transition') private readonly transitionQueue: Queue,
//     @InjectQueue('start') private readonly startQueue: Queue,
//     @Inject(RedlockService)
//     private readonly redlockService: RedlockService,
//     @Inject(ProcessManagementService)
//     private processManagementService: ProcessManagementService
//   ) {}

//   log(message, method, session, user = 'ANONYMOUS') {
//     this.logger.log(
//       message,
//       JSON.stringify({
//         class: CronService.name,
//         method: method,
//         session: session,
//         user: user,
//       })
//     );
//   }
//   debug(message, method, session, user = 'ANONYMOUS') {
//     this.logger.debug(
//       message,
//       JSON.stringify({
//         class: CronService.name,
//         method: method,
//         session: session,
//         user: user,
//       })
//     );
//   }
//   warn(message, method, session, user = 'ANONYMOUS') {
//     this.logger.warn(
//       message,
//       JSON.stringify({
//         class: CronService.name,
//         method: method,
//         session: session,
//         user: user,
//       })
//     );
//   }
//   error(error, method, session, user = 'ANONYMOUS') {
//     this.logger.error(
//       error.message,
//       error.stack,
//       JSON.stringify({
//         class: CronService.name,
//         method: method,
//         session: session,
//         cause: error.cause,
//         name: error.name,
//         user: user,
//       })
//     );
//   }
//   verbose(message, method, session, user = 'ANONYMOUS') {
//     this.logger.verbose(
//       message,
//       JSON.stringify({
//         class: CronService.name,
//         method: method,
//         session: session,
//         user: user,
//       })
//     );
//   }

//   // TODO: might be deleted after clarification
//   // @Cron(CronExpression.EVERY_HOUR)
//   // async handleCustomerKeysCron() {
//   //   const session = randomUUID();
//   //   try {
//   //     let current = 0;
//   //     const documentsCount = await this.customerModel
//   //       .estimatedDocumentCount()
//   //       .exec();

//   //     const keys: Record<string, any[]> = {};
//   //     const keyCustomerMap: Record<string, Set<string>> = {};

//   //     while (current < documentsCount) {
//   //       const batch = await this.customerModel
//   //         .find()
//   //         .skip(current)
//   //         .limit(BATCH_SIZE)
//   //         .exec();

//   //       batch.forEach((customer) => {
//   //         const obj = customer.toObject();
//   //         for (const key of Object.keys(obj)) {
//   //           if (KEYS_TO_SKIP.includes(key)) continue;

//   //           if (keys[key]) {
//   //             keys[key].push(obj[key]);
//   //             keyCustomerMap[key].add(customer.workspaceId);
//   //             continue;
//   //           }

//   //           keys[key] = [obj[key]];
//   //           keyCustomerMap[key] = new Set([customer.workspaceId]);
//   //         }
//   //       });
//   //       current += BATCH_SIZE;
//   //     }

//   //     for (const key of Object.keys(keys)) {
//   //       const validItem = keys[key].find(
//   //         (item) => item !== '' && item !== undefined && item !== null
//   //       );

//   //       if (validItem === '' || validItem === undefined || validItem === null)
//   //         continue;

//   //       const keyType = getType(validItem);
//   //       const isArray = keyType.isArray();
//   //       let type = isArray ? getType(validItem[0]).name : keyType.name;

//   //       if (type === 'String') {
//   //         if (isEmail(validItem)) type = 'Email';
//   //         if (isDateString(validItem)) type = 'Date';
//   //       }

//   //       for (const workspaceId of keyCustomerMap[key].values()) {
//   //         await this.customerKeysModel
//   //           .updateOne(
//   //             { key, workspaceId },
//   //             {
//   //               $set: {
//   //                 key,
//   //                 type,
//   //                 isArray,
//   //                 workspaceId,
//   //               },
//   //             },
//   //             { upsert: true }
//   //           )
//   //           .exec();
//   //       }
//   //     }
//   //   } catch (e) {
//   //     this.error(e, this.handleCustomerKeysCron.name, session);
//   //   }
//   // }

//   parseJourneyLocation(row) {
//     // Extracting step-related properties
//     const step = new Step();
//     step.id = row.step_id;
//     step.createdAt = row.step_createdAt;
//     step.type = row.step_type;
//     step.customers = row.step_customers;
//     step.metadata = row.step_metadata;
//     step.workspace = row.step_workspaceId;
//     step.journey = row.step_journeyId;

//     // Creating the JourneyLocation object
//     const location = new JourneyLocation();
//     location.journey = row.journeyLocation_journeyId;
//     location.customer = row.journeyLocation_customer;
//     location.stepEntry = row.journeyLocation_stepEntry;
//     location.journeyEntry = row.journeyLocation_journeyEntry;
//     location.moveStarted = row.journeyLocation_moveStarted;
//     location.messageSent = row.journeyLocation_messageSent;
//     location.step = row.journeyLocation_stepId;
//     location.workspace = row.journeyLocation_workspaceId;
//     // location.step= step;
//     return location;
//   }

//   @Cron(CronExpression.EVERY_MINUTE)
//   async minuteTasks() {
//     const session = randomUUID();
//     // Time based steps
//     let timeBasedErr: any;
//     let queryRunner = this.dataSource.createQueryRunner();
//     await queryRunner.connect();
//     await queryRunner.startTransaction();
//     const timeBasedJobs: any[] = [];
//     const totalProcessors =
//       await this.processManagementService.getTotalProcesses();
//     try {
//       const journeys = await this.journeysService.allActiveTransactional(
//         queryRunner
//       );
//       for (
//         let journeyIndex = 0;
//         journeyIndex < journeys.length;
//         journeyIndex++
//       ) {
//         const locations =
//           await this.journeyLocationsService.findAllStaticCustomersInTimeBasedSteps(
//             journeys[journeyIndex],
//             session,
//             queryRunner
//           );
//         for await (const row of this.journeyLocationsService.findAllStaticCustomersInTimeBasedStepsUsingStream(
//           journeys[journeyIndex],
//           session,
//           this.processManagementService.getProcessIndex(),
//           totalProcessors,
//           30000,
//           queryRunner
//         )) {
//           const location = this.parseJourneyLocation(row);
//           const step = await this.stepsService.findByID(
//             String(location.step),
//             session,
//             null,
//             queryRunner
//           );
//           let branch;
//           // Set branch to -1 for wait until
//           if (step.type === StepType.WAIT_UNTIL_BRANCH) {
//             //Wait until time branch isnt set, continue
//             if (!step.metadata.timeBranch) {
//               continue;
//             }
//             branch = -1;
//           }
//           // Checking if enough time has elapsed to add step
//           switch (step.type) {
//             case StepType.WAIT_UNTIL_BRANCH:
//               if (step.metadata.timeBranch.delay) {
//                 if (
//                   Date.now() - location.stepEntry <
//                   Temporal.Duration.from(step.metadata.timeBranch.delay).total({
//                     unit: 'millisecond',
//                   })
//                 ) {
//                   continue;
//                 }
//               } else if (step.metadata.timeBranch.window) {
//                 // Case 1: days of the week/time of day
//                 if (step.metadata.timeBranch.window.onDays) {
//                   const now = new Date();

//                   const startTime = new Date(now.getTime());
//                   startTime.setHours(
//                     step.metadata.timeBranch.window.fromTime.split(':')[0]
//                   );
//                   startTime.setMinutes(
//                     step.metadata.timeBranch.window.fromTime.split(':')[1]
//                   );

//                   const endTime = new Date(now.getTime());
//                   endTime.setHours(
//                     step.metadata.timeBranch.window.toTime.split(':')[0]
//                   );
//                   endTime.setMinutes(
//                     step.metadata.timeBranch.window.toTime.split(':')[1]
//                   );

//                   const day = now.getDay();

//                   if (
//                     !(
//                       startTime < now &&
//                       endTime > now &&
//                       step.metadata.window.onDays[day] === 1
//                     )
//                   ) {
//                     continue;
//                   }
//                 }
//                 // Case2: Date and time of window
//                 else {
//                   if (
//                     !(
//                       new Date(
//                         Temporal.Instant.from(
//                           step.metadata.timeBranch.window.from
//                         ).epochMilliseconds
//                       ).getTime() < Date.now() &&
//                       Date.now() <
//                         new Date(
//                           Temporal.Instant.from(
//                             step.metadata.timeBranch.window.to
//                           ).epochMilliseconds
//                         ).getTime()
//                     )
//                   ) {
//                     continue;
//                   }
//                 }
//               }
//               break;
//             case StepType.TIME_WINDOW:
//               // Case 1: Specific days of the week
//               if (step.metadata.window.onDays) {
//                 const now = new Date();

//                 const startTime = new Date(now.getTime());
//                 startTime.setHours(step.metadata.window.fromTime.split(':')[0]);
//                 startTime.setMinutes(
//                   step.metadata.window.fromTime.split(':')[1]
//                 );

//                 const endTime = new Date(now.getTime());
//                 endTime.setHours(step.metadata.window.toTime.split(':')[0]);
//                 endTime.setMinutes(step.metadata.window.toTime.split(':')[1]);

//                 const day = now.getDay();

//                 this.warn(
//                   JSON.stringify({ day, startTime, endTime, now, step }),
//                   this.minuteTasks.name,
//                   session
//                 );

//                 if (
//                   !(
//                     startTime < now &&
//                     endTime > now &&
//                     step.metadata.window.onDays[day] === 1
//                   )
//                 ) {
//                   continue;
//                 }
//               }
//               // Case2: Date and time of window
//               else {
//                 if (
//                   !(
//                     new Date(
//                       Temporal.Instant.from(
//                         step.metadata.window.from
//                       ).epochMilliseconds
//                     ).getTime() < Date.now() &&
//                     Date.now() <
//                       new Date(
//                         Temporal.Instant.from(
//                           step.metadata.window.to
//                         ).epochMilliseconds
//                       ).getTime()
//                   )
//                 ) {
//                   continue;
//                 }
//               }
//               break;
//             case StepType.TIME_DELAY:
//               if (
//                 Date.now() - location.stepEntry <
//                 Temporal.Duration.from(step.metadata.delay).total({
//                   unit: 'millisecond',
//                 })
//               ) {
//                 continue;
//               }
//               break;
//             default:
//               break;
//           }
//           try {
//             await this.journeyLocationsService.lock(
//               location,
//               session,
//               undefined,
//               queryRunner
//             );
//             timeBasedJobs.push({
//               name: String(step.type),
//               data: {
//                 step: step,
//                 owner:
//                   await this.accountsService.findOrganizationOwnerByWorkspaceId(
//                     step.workspace.id,
//                     session
//                   ),
//                 session: session,
//                 journey: journeys[journeyIndex],
//                 customer: await this.customerModel
//                   .findById(location.customer)
//                   .exec(),
//                 location: location,
//                 branch,
//               },
//               opts: {
//                 jobId: generateUniqueJobId({
//                   step: step,
//                   ownerID: step.workspace.organization.owner.id,
//                   journeyID: journeys[journeyIndex].id,
//                   customerID: location.customer,
//                 }),
//               },
//             });
//           } catch (e) {
//             this.warn(
//               `Encountered error handling time based steps`,
//               this.minuteTasks.name,
//               session
//             );
//             this.error(e, this.minuteTasks.name, session);
//           }
//         }
//       }
//       await queryRunner.commitTransaction();
//     } catch (e) {
//       timeBasedErr = e;
//       this.warn(
//         `Encountered error handling time based steps`,
//         this.minuteTasks.name,
//         session
//       );
//       this.error(e, this.minuteTasks.name, session);
//       await queryRunner.rollbackTransaction();
//     } finally {
//       await queryRunner.release();
//     }
//     if (!timeBasedErr) await this.transitionQueue.addBulk(timeBasedJobs);

//     // Handle expiry of recovery emails
//     let recoveryErr: any;
//     try {
//       await this.recoveryRepository
//         .createQueryBuilder()
//         .where(`now() > recovery."createdAt"::TIMESTAMP + INTERVAL '1 HOUR'`)
//         .delete()
//         .execute();
//     } catch (e) {
//       recoveryErr = e;
//       this.warn(
//         `Encountered error handling expiry of recovery emails`,
//         this.minuteTasks.name,
//         session
//       );
//       this.error(e, this.minuteTasks.name, session);
//     }

//     // Handle organization invte expiry
//     let orgInviteErr: any;
//     try {
//       await this.organizationInvitesRepository
//         .createQueryBuilder()
//         .where(
//           `now() > organization_invites."createdAt"::TIMESTAMP + INTERVAL '1 DAY'`
//         )
//         .delete()
//         .execute();
//     } catch (e) {
//       orgInviteErr = e;
//       this.warn(
//         `Encountered error handling expiry of organization invites`,
//         this.minuteTasks.name,
//         session
//       );
//       this.error(e, this.minuteTasks.name, session);
//     }

//     // Handle requeueing messages for quiet hours/rate limiting
//     // let requeueErr: any;
//     // queryRunner = this.dataSource.createQueryRunner();
//     // await queryRunner.connect();
//     // await queryRunner.startTransaction();
//     // try {
//     //   const requeuedMessages = await this.stepsService.getRequeuedMessages(
//     //     session,
//     //     queryRunner
//     //   );
//     //   const bulkJobs: { name: string; data: any }[] = [];
//     //   for (const requeue of requeuedMessages) {
//     //     // THIS MIGHT BE SLOWER THAN WE WANT querying for the customer from.
//     //     // findAndLock only uses customer.id, but the function currently
//     //     // only accepts the whole customer document. Consider changing
//     //     const customer = await this.customersService.findByCustomerId(
//     //       requeue.customerId,
//     //       undefined
//     //     );
//     //     await this.journeyLocationsService.findAndLock(
//     //       requeue.step.journey,
//     //       customer,
//     //       session,
//     //       requeue?.workspace?.organization?.owner,
//     //       queryRunner
//     //     );
//     //     await bulkJobs.push({
//     //       name: StepType.MESSAGE,
//     //       data: {
//     //         owner: requeue.workspace?.organization?.owner,
//     //         journey: requeue.step.journey,
//     //         step: requeue.step,
//     //         session,
//     //         customerID: requeue.customerId,
//     //       },
//     //     });
//     //     await queryRunner.manager.remove(requeue);
//     //   }
//     //   await this.transitionQueue.addBulk(bulkJobs);
//     //   await queryRunner.commitTransaction();
//     // } catch (e) {
//     //   requeueErr = e;
//     //   this.warn(
//     //     `Encountered error requeueing messages`,
//     //     this.minuteTasks.name,
//     //     session
//     //   );
//     //   this.error(e, this.minuteTasks.name, session);
//     //   await queryRunner.rollbackTransaction();
//     // } finally {
//     //   await queryRunner.release();
//     // }
//   }

//   @Cron(CronExpression.EVERY_10_SECONDS)
//   async printTimeoutLength() {
//     const session = randomUUID();
//     // this.log(
//     //   `Number of timeouts: ${global.timeoutIds.size}`,
//     //   this.printTimeoutLength.name,
//     //   session
//     // );
//     // this.log(
//     //   `Number of intervals: ${global.intervalIds.size}`,
//     //   this.printTimeoutLength.name,
//     //   session
//     // );

//     // this.log(
//     //   `My process number: ${this.processManagementService.getProcessIndex()}`,
//     //   this.printTimeoutLength.name,
//     //   session
//     // );
//     // this.log(
//     //   `Total number of processes: ${await this.processManagementService.getTotalProcesses()}`,
//     //   this.printTimeoutLength.name,
//     //   session
//     // );

//     this.log(
//       `os.cpus().length: ${os.cpus().length}`,
//       this.printTimeoutLength.name,
//       session
//     );
//     this.log(
//       `DATABASE_MAX_CONNECTIONS: ${process.env.DATABASE_MAX_CONNECTIONS}`,
//       this.printTimeoutLength.name,
//       session
//     );
//     this.log(
//       `DEPLOY_MAX_REPLICAS: ${process.env.DEPLOY_MAX_REPLICAS}`,
//       this.printTimeoutLength.name,
//       session
//     );

//     // let timeoutID = +(setTimeout(function () { }, 0));
//     // let intervalID = +(setInterval(function () { }, 0));

//     // while (timeoutID--) {
//     //   clearTimeout(timeoutID); // will do nothing if no timeout with id is present
//     // }

//     // while (intervalID--) {
//     //   clearTimeout(intervalID); // will do nothing if no timeout with id is present
//     // }
//   }

//   @Cron(CronExpression.EVERY_HOUR)
//   async handleEventKeysCron() {
//     const session = randomUUID();
//     try {
//       let current = 0;
//       const documentsCount = await this.eventModel
//         .estimatedDocumentCount()
//         .exec();

//       const keys: Record<string, { value: any; workspaceId: string }[]> = {};

//       while (current < documentsCount) {
//         const batch = await this.eventModel
//           .find()
//           .skip(current)
//           .limit(BATCH_SIZE)
//           .exec();

//         batch.forEach((event) => {
//           const workspaceId = event.workspaceId;
//           const obj = (event.toObject() as any)?.event || {};
//           for (const key of Object.keys(obj)) {
//             if (KEYS_TO_SKIP.includes(key)) continue;

//             if (keys[key]) {
//               keys[key].push({ value: obj[key], workspaceId });
//               continue;
//             }

//             keys[key] = [{ value: obj[key], workspaceId }];
//           }
//         });

//         current += BATCH_SIZE;
//       }

//       for (const key of Object.keys(keys)) {
//         const validItems = keys[key].filter(
//           (item) =>
//             item.value !== '' && item.value !== undefined && item.value !== null
//         );

//         if (!validItems.length) continue;

//         let batchToSave = [];
//         for (const validItem of validItems) {
//           const keyType = getType(validItem.value);
//           const isArray = keyType.isArray();
//           let type = isArray ? getType(validItem.value[0]).name : keyType.name;

//           if (type === 'String') {
//             if (isEmail(validItem.value)) type = 'Email';
//             if (isDateString(validItem.value)) type = 'Date';
//           }

//           const eventKey = {
//             key,
//             type,
//             isArray,
//             workspaceId: validItem.workspaceId,
//           };

//           const foundEventKey = await this.eventKeysModel
//             .findOne(eventKey)
//             .exec();

//           if (!foundEventKey) {
//             batchToSave.push(eventKey);
//           }

//           if (batchToSave.length > BATCH_SIZE) {
//             await this.eventKeysModel.insertMany(batchToSave);
//             batchToSave = [];
//           }
//         }
//         await this.eventKeysModel.insertMany(batchToSave);
//       }
//     } catch (e) {
//       this.error(e, this.handleEventKeysCron.name, session);
//     }
//   }

//   @Cron(CronExpression.EVERY_HOUR)
//   async handleVerificationCheck() {
//     const session = randomUUID();
//     try {
//       await this.verificationRepository
//         .createQueryBuilder()
//         .where(
//           `verification.status = 'sent' AND now() > verification."createdAt"::TIMESTAMP + INTERVAL '1 HOUR'`
//         )
//         .update({ status: 'expired' })
//         .execute();
//     } catch (e) {
//       this.error(e, this.handleVerificationCheck.name, session);
//     }
//   }

//   @Cron(CronExpression.EVERY_HOUR)
//   async handleIntegrations() {
//     const integrationsNumber = await this.integrationsRepository.countBy({
//       status: IntegrationStatus.ACTIVE,
//     });

//     let offset = 0;

//     while (offset < integrationsNumber) {
//       const integrationsBatch = await this.integrationsRepository.find({
//         where: { status: IntegrationStatus.ACTIVE },
//         relations: ['database', 'owner'],
//         take: BATCH_SIZE,
//         skip: offset,
//       });

//       for (const integration of integrationsBatch) {
//         await this.integrationsService.handleIntegration(integration);
//       }

//       offset += BATCH_SIZE;
//     }
//   }

//   /*
//    * helper function that deletes
//    *
//    */

//   checkSegmentHasMessageFilters(
//     segmentCriteria: any,
//     orgId: string,
//     session: string
//   ): boolean {
//     // Convert the segmentCriteria object to a JSON string
//     const criteriaString = JSON.stringify(segmentCriteria);

//     // Check for the presence of any of the specified types in the string
//     return /"type":\s*"(Email|Push|In-app message|SMS)"/.test(criteriaString);
//   }
//   /*
//    *
//    * Function goes through all dyanmic segments, and finds
//    * those with message filters, and updates segment membership
//    * with users (add, remove) based on message events
//    * then updates message events to say they have been processed
//    *
//    * to do
//    *
//    *
//    * this could theoretically be optimized if we wrote a function
//    * that does incremental segment addition and removal instead of
//    * complete recalculation. ie takes segment criteria and only looks
//    * at clickhouse unprocessed events
//    *
//    */
//   @Cron(CronExpression.EVERY_10_MINUTES)
//   async updateStatementsWithMessageEvents() {
//     const session = randomUUID();
//     let err;
//     //console.log("about to run updateStatementsWithMessageEvents");
//     // for each organization, get all segments
//     // to do change this to organisations rather than
//     const accounts = await this.accountsService.findAll();
//     for (let j = 0; j < accounts.length; j++) {
//       const queryRunner = this.dataSource.createQueryRunner();
//       await queryRunner.connect();
//       await queryRunner.startTransaction();
//       const segmentPrefixes: string[] = [];
//       //we keep for logging
//       let segmentError: string;
//       try {
//         const segments = await this.segmentsService.getSegments(
//           accounts[j],
//           undefined,
//           queryRunner
//         );
//         // for each segment check if it has a message component
//         for (const segment of segments) {
//           if (!segment.inclusionCriteria || !segment.inclusionCriteria.query) {
//             continue; // Skip to the next iteration of the loop
//           }

//           const doInclude = this.checkSegmentHasMessageFilters(
//             segment.inclusionCriteria.query,
//             accounts[j].id,
//             session
//           );
//           this.debug(
//             `we updated doInclude: ${doInclude}`,
//             this.updateStatementsWithMessageEvents.name,
//             session,
//             accounts[j].id
//           );
//           if (doInclude) {
//             // If segment includes message filters recalculate which customers should be in the segment
//             const collectionPrefix =
//               this.segmentsService.generateRandomString();
//             segmentError = segment.name;
//             this.debug(
//               `segment is: ${segment}`,
//               this.updateStatementsWithMessageEvents.name,
//               session,
//               accounts[j].id
//             );
//             this.debug(
//               `chron prefix for segment is: ${collectionPrefix}`,
//               this.updateStatementsWithMessageEvents.name,
//               session,
//               accounts[j].id
//             );
//             segmentPrefixes.push(collectionPrefix);
//             const customersInSegment =
//               await this.customersService.getSegmentCustomersFromQuery(
//                 segment.inclusionCriteria.query,
//                 accounts[j],
//                 session,
//                 true,
//                 0,
//                 collectionPrefix
//               );

//             this.debug(
//               `we have customersInSegment: ${customersInSegment}`,
//               this.updateStatementsWithMessageEvents.name,
//               session,
//               accounts[j].id
//             );
//             // update the segment customer table
//             //try {
//             //collectionName: string,account: Account,segmentId: string,session: string,queryRunner: QueryRunner,batchSize: number = 500 //
//             await this.segmentsService.updateSegmentCustomersBatched(
//               customersInSegment,
//               accounts[j],
//               segment.id,
//               session,
//               queryRunner,
//               500
//             );
//             // drop the collections after adding customer segments
//             await this.segmentsService.deleteCollectionsWithPrefix(
//               collectionPrefix
//             );
//           }
//         }
//         await queryRunner.commitTransaction();
//       } catch (error) {
//         this.debug(
//           `error updating segment: ${segmentError}`,
//           this.updateStatementsWithMessageEvents.name,
//           session,
//           accounts[j].id
//         );
//         this.error(
//           error,
//           this.updateStatementsWithMessageEvents.name,
//           session,
//           accounts[j].id
//         );
//         //drop extraneous collections in case of error
//         for (const prefix of segmentPrefixes) {
//           await this.segmentsService.deleteCollectionsWithPrefix(prefix);
//         }
//         await queryRunner.rollbackTransaction();
//         err = error;
//       } finally {
//         await queryRunner.release();
//       }
//     }
//   }

//   // @Cron(CronExpression.EVERY_DAY_AT_NOON)
//   // async handleMissedMailgunEvents() {
//   //   const session = randomUUID();
//   //   try {
//   //     // Get all pending Mailgun Jobs and accounts
//   //     const mailgunJobs = await this.webhookJobsService.findAllByProvider(
//   //       WebhookProvider.MAILGUN
//   //     );
//   //     const accounts = await this.accountsService.findAll();

//   //     // Create new pending Mailgun Job
//   //     await this.webhookJobsService.create({
//   //       provider: WebhookProvider.MAILGUN,
//   //       status: WebhookJobStatus.PENDING,
//   //     });

//   //     // Iterate through Jobs
//   //     for (let i = 0; i < mailgunJobs.length; i++) {
//   //       const startTime = mailgunJobs[i].createdAt;

//   //       // Update job status
//   //       await this.webhookJobsService.update(mailgunJobs[i].id, {
//   //         status: WebhookJobStatus.IN_PROGRESS,
//   //       });

//   //       //Iterate through accounts
//   //       for (let j = 0; j < accounts.length; j++) {
//   //         if (
//   //           accounts[j]?.teams?.[0]?.organization?.workspaces?.[0]
//   //             .mailgunAPIKey &&
//   //           accounts[j]?.teams?.[0]?.organization?.workspaces?.[0].sendingDomain
//   //         ) {
//   //           const mailgun = new Mailgun(formData);
//   //           const mg = mailgun.client({
//   //             username: 'api',
//   //             key: accounts[j]?.teams?.[0]?.organization?.workspaces?.[0]
//   //               .mailgunAPIKey,
//   //           });
//   //           let query, events;
//   //           query = {
//   //             begin: startTime.toUTCString(),
//   //             limit: 300,
//   //             ascending: 'yes',
//   //           };
//   //           do {
//   //             events = await mg.events.get(
//   //               accounts[j]?.teams?.[0]?.organization?.workspaces?.[0]
//   //                 ?.sendingDomain,
//   //               query
//   //             );
//   //             for (let k = 0; k < events.items.length; k++) {
//   //               const existsCheck = await this.clickHouseClient.query({
//   //                 query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event = {event:String} AND messageId = {messageId:String}`,
//   //                 query_params: {
//   //                   event: events.items[k].event,
//   //                   messageId: events.items[k].message.headers['message-id'],
//   //                 },
//   //               });
//   //               const existsRows = JSON.parse(await existsCheck.text());
//   //               if (existsRows.data.length == 0) {
//   //                 const messageInfo = await this.clickHouseClient.query({
//   //                   query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE messageId = {messageId:String} AND audienceId IS NOT NULL AND customerId IS NOT NULL AND templateId IS NOT NULL LIMIT 1`,
//   //                   query_params: {
//   //                     messageId: events.items[k].message.headers['message-id'],
//   //                   },
//   //                 });
//   //                 const messageRow = JSON.parse(await messageInfo.text()).data;
//   //                 const messagesToInsert: ClickHouseMessage[] = [];
//   //                 const clickHouseRecord: ClickHouseMessage = {
//   //                   workspaceId:
//   //                     accounts[j]?.teams?.[0]?.organization?.workspaces?.[0].id,
//   //                   audienceId: messageRow[0]?.audienceId,
//   //                   customerId: messageRow[0]?.customerId,
//   //                   templateId: messageRow[0]?.templateId,
//   //                   messageId: events.items[k].message.headers['message-id'],
//   //                   event: events.items[k].event,
//   //                   eventProvider: ClickHouseEventProvider.MAILGUN,
//   //                   createdAt: new Date(
//   //                     events.items[k].timestamp * 1000
//   //                   ).toISOString(),
//   //                   processed: false,
//   //                 };
//   //                 messagesToInsert.push(clickHouseRecord);
//   //                 await this.clickHouseClient.insert<ClickHouseMessage>({
//   //                   table: ${ClickHouseTable.MESSAGE_STATUS},
//   //                   values: messagesToInsert,
//   //                   format: 'JSONEachRow',
//   //                 });
//   //               }
//   //             }
//   //             query = { page: events.pages.next.number };
//   //           } while (events?.items?.length > 0 && query.page);
//   //         }
//   //       }
//   //       await this.webhookJobsService.remove(mailgunJobs[i].id);
//   //     }
//   //   } catch (err) {
//   //     this.error(err, this.handleMissedMailgunEvents.name, session);
//   //   }
//   // }

//   // @Cron(CronExpression.EVERY_DAY_AT_NOON)
//   // async handleMissedSendgridEvents() {
//   //   const session = randomUUID();
//   //   try {
//   //     // Get all pending Twilio Jobs and accounts
//   //     const sendgridJobs = await this.webhookJobsService.findAllByProvider(
//   //       WebhookProvider.SENDGRID
//   //     );
//   //     const accounts = await this.accountsService.findAll();

//   //     // Create new pending Twilio Job
//   //     await this.webhookJobsService.create({
//   //       provider: WebhookProvider.SENDGRID,
//   //       status: WebhookJobStatus.PENDING,
//   //     });

//   //     // Iterate through Jobs
//   //     for (let i = 0; i < sendgridJobs.length; i++) {
//   //       // Update job status
//   //       await this.webhookJobsService.update(sendgridJobs[i].id, {
//   //         status: WebhookJobStatus.IN_PROGRESS,
//   //       });

//   //       //Iterate through accounts
//   //       for (let j = 0; j < accounts.length; j++) {
//   //         if (
//   //           accounts[j].teams?.[0]?.organization?.workspaces?.[0].sendgridApiKey
//   //         ) {
//   //           client.setApiKey(
//   //             accounts[j].teams?.[0]?.organization?.workspaces?.[0]
//   //               .sendgridApiKey
//   //           );
//   //           const resultSet = await this.clickHouseClient.query({
//   //             query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE processed = false AND eventProvider = 'sendgrid' AND workspaceId = {workspaceId:String}`,
//   //             query_params: {
//   //               workspaceId:
//   //                 accounts[j].teams?.[0]?.organization?.workspaces?.[0].id,
//   //             },
//   //             format: 'JSONEachRow',
//   //           });
//   //           for await (const rows of resultSet.stream()) {
//   //             rows.forEach(async (row) => {
//   //               const rowObject = JSON.parse(row.text);
//   //               // Step 1: Check if the message has already reached an end state: delivered, undelivered, failed, canceled
//   //               const existsCheck = await this.clickHouseClient.query({
//   //                 query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event IN ('dropped', 'bounce', 'blocked', 'open', 'click', 'spamreport', 'unsubscribe','group_unsubscribe','group_resubscribe') AND messageId = {messageId:String}`,
//   //                 query_params: { messageId: rowObject.messageId },
//   //               });
//   //               const existsRows = JSON.parse(await existsCheck.text());

//   //               // If not reached end state, check if reached end state using API
//   //               if (existsRows.data.length === 0) {
//   //                 let message;
//   //                 try {
//   //                   const response: any = await client.request({
//   //                     url: `/v3/messages`,
//   //                     method: 'GET',
//   //                     qs: {
//   //                       query: `msg_id=${rowObject.messageId}`,
//   //                     },
//   //                   });
//   //                   message = response.body.messages[0];
//   //                 } catch (err) {
//   //                   // User is unauthorized to use events api, so we return
//   //                   return;
//   //                 }

//   //                 // Reached end state using API; update end state and set as processed in clickhouse
//   //                 if (
//   //                   ['delivered', 'dropped', 'bounce', 'blocked'].includes(
//   //                     message.status
//   //                   )
//   //                 ) {
//   //                   const messagesToInsert: ClickHouseMessage[] = [];
//   //                   const clickHouseRecord: ClickHouseMessage = {
//   //                     audienceId: rowObject.audienceId,
//   //                     customerId: rowObject.customerId,
//   //                     templateId: rowObject.templateId,
//   //                     messageId: rowObject.messageId,
//   //                     event: message.status,
//   //                     eventProvider: ClickHouseEventProvider.TWILIO,
//   //                     createdAt: new Date().toISOString(),
//   //                     workspaceId:
//   //                       accounts[j].teams?.[0]?.organization?.workspaces?.[0]
//   //                         ?.id,
//   //                     processed: false,
//   //                   };
//   //                   messagesToInsert.push(clickHouseRecord);
//   //                   await this.clickHouseClient.insert<ClickHouseMessage>({
//   //                     table: ${ClickHouseTable.MESSAGE_STATUS},
//   //                     values: messagesToInsert,
//   //                     format: 'JSONEachRow',
//   //                   });
//   //                   await this.clickHouseClient.query({
//   //                     query: `ALTER TABLE ${ClickHouseTable.MESSAGE_STATUS} UPDATE processed=true WHERE eventProvider='sendgrid' AND event = 'sent' AND messageId = {messageId:String} AND templateId = {templateId:String} AND customerId = {customerId:String} AND audienceId = {audienceId:String}`,
//   //                     query_params: {
//   //                       messageId: rowObject.messageId,
//   //                       templateId: rowObject.templateId,
//   //                       customerId: rowObject.customerId,
//   //                       audienceId: rowObject.audienceId,
//   //                     },
//   //                   });
//   //                 }
//   //                 //Has not reached end state; do nothing
//   //               }
//   //               // Has reached end state using webhooks; update processed = true
//   //               else {
//   //                 await this.clickHouseClient.query({
//   //                   query: `ALTER TABLE ${ClickHouseTable.MESSAGE_STATUS} UPDATE processed=true WHERE eventProvider='sendgrid' AND event = 'sent' AND messageId = {messageId:String} AND templateId = {templateId:String} AND customerId = {customerId:String} AND audienceId = {audienceId:String}`,
//   //                   query_params: {
//   //                     messageId: rowObject.messageId,
//   //                     templateId: rowObject.templateId,
//   //                     customerId: rowObject.customerId,
//   //                     audienceId: rowObject.audienceId,
//   //                   },
//   //                 });
//   //               }
//   //             });
//   //           }
//   //         }
//   //       }
//   //       await this.webhookJobsService.remove(sendgridJobs[i].id);
//   //     }
//   //   } catch (err) {
//   //     this.error(err, this.handleMissedSendgridEvents.name, session);
//   //   }
//   // }

//   // @Cron(CronExpression.EVERY_DAY_AT_NOON)
//   // async handleMissedTwilioEvents() {
//   //   const session = randomUUID();
//   //   try {
//   //     // Get all pending Twilio Jobs and accounts
//   //     const twilioJobs = await this.webhookJobsService.findAllByProvider(
//   //       WebhookProvider.TWILIO_SMS
//   //     );
//   //     const accounts = await this.accountsService.findAll();

//   //     // Create new pending Twilio Job
//   //     await this.webhookJobsService.create({
//   //       provider: WebhookProvider.TWILIO_SMS,
//   //       status: WebhookJobStatus.PENDING,
//   //     });

//   //     // Iterate through Jobs
//   //     for (let i = 0; i < twilioJobs.length; i++) {
//   //       // Update job status
//   //       await this.webhookJobsService.update(twilioJobs[i].id, {
//   //         status: WebhookJobStatus.IN_PROGRESS,
//   //       });

//   //       //Iterate through accounts
//   //       for (let j = 0; j < accounts.length; j++) {
//   //         const workspace =
//   //           accounts[j].teams?.[0]?.organization?.workspaces?.[0];
//   //         if (workspace.smsAccountSid && workspace.smsAuthToken) {
//   //           const twilioClient = twilio(
//   //             workspace.smsAccountSid,
//   //             workspace.smsAuthToken
//   //           );
//   //           const resultSet = await this.clickHouseClient.query({
//   //             query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE processed = false AND eventProvider = 'twilio' AND workspaceId = {workspaceId:String}`,
//   //             query_params: {
//   //               workspaceId:
//   //                 accounts[j].teams?.[0]?.organization?.workspaces?.[0]?.id,
//   //             },
//   //             format: 'JSONEachRow',
//   //           });
//   //           for await (const rows of resultSet.stream()) {
//   //             rows.forEach(async (row) => {
//   //               const rowObject = JSON.parse(row.text);
//   //               // Step 1: Check if the message has already reached an end state: delivered, undelivered, failed, canceled
//   //               const existsCheck = await this.clickHouseClient.query({
//   //                 query: `SELECT * FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event IN ('delivered', 'undelivered', 'failed', 'canceled') AND messageId = {messageId:String}`,
//   //                 query_params: { messageId: rowObject.messageId },
//   //               });
//   //               const existsRows = JSON.parse(await existsCheck.text());
//   //               if (existsRows.data.length === 0) {
//   //                 const message = await twilioClient
//   //                   .messages(rowObject.messageId)
//   //                   .fetch();
//   //                 if (
//   //                   ['delivered', 'undelivered', 'failed', 'canceled'].includes(
//   //                     message.status
//   //                   )
//   //                 ) {
//   //                   const messagesToInsert: ClickHouseMessage[] = [];
//   //                   const clickHouseRecord: ClickHouseMessage = {
//   //                     audienceId: rowObject.audienceId,
//   //                     customerId: rowObject.customerId,
//   //                     templateId: rowObject.templateId,
//   //                     messageId: rowObject.messageId,
//   //                     event: message.status,
//   //                     eventProvider: ClickHouseEventProvider.TWILIO,
//   //                     createdAt: new Date().toISOString(),
//   //                     workspaceId:
//   //                       accounts[j].teams?.[0]?.organization?.workspaces?.[0]
//   //                         .id,
//   //                     processed: false,
//   //                   };
//   //                   messagesToInsert.push(clickHouseRecord);
//   //                   await this.clickHouseClient.insert<ClickHouseMessage>({
//   //                     table: ${ClickHouseTable.MESSAGE_STATUS},
//   //                     values: messagesToInsert,
//   //                     format: 'JSONEachRow',
//   //                   });
//   //                   await this.clickHouseClient.query({
//   //                     query: `ALTER TABLE ${ClickHouseTable.MESSAGE_STATUS} UPDATE processed=true WHERE eventProvider='twilio' AND event = 'sent' AND messageId = {messageId:String} AND templateId = {templateId:String} AND customerId = {customerId:String} AND audienceId = {audienceId:String}`,
//   //                     query_params: {
//   //                       messageId: rowObject.messageId,
//   //                       templateId: rowObject.templateId,
//   //                       customerId: rowObject.customerId,
//   //                       audienceId: rowObject.audienceId,
//   //                     },
//   //                   });
//   //                 }
//   //               } else {
//   //                 await this.clickHouseClient.query({
//   //                   query: `ALTER TABLE ${ClickHouseTable.MESSAGE_STATUS} UPDATE processed=true WHERE eventProvider='twilio' AND event = 'sent' AND messageId = {messageId:String} AND templateId = {templateId:String} AND customerId = {customerId:String} AND audienceId = {audienceId:String}`,
//   //                   query_params: {
//   //                     messageId: rowObject.messageId,
//   //                     templateId: rowObject.templateId,
//   //                     customerId: rowObject.customerId,
//   //                     audienceId: rowObject.audienceId,
//   //                   },
//   //                 });
//   //               }
//   //             });
//   //           }
//   //         }
//   //       }
//   //       await this.webhookJobsService.remove(twilioJobs[i].id);
//   //     }
//   //   } catch (err) {
//   //     this.error(err, this.handleMissedTwilioEvents.name, session);
//   //   }
//   // }

//   // @Cron(CronExpression.EVERY_MINUTE)
//   // async handleExpiredModalEvents() {
//   //   const session = randomUUID();
//   //   try {
//   //     await this.modalsService.deleteExpiredModalEvents();
//   //   } catch (e) {
//   //     this.error(e, this.handleExpiredModalEvents.name, session);
//   //   }
//   // }

//   @Cron(CronExpression.EVERY_30_MINUTES)
//   async cleanTrashSteps() {
//     const session = randomUUID();
//     const queryRunner = this.dataSource.createQueryRunner();
//     await queryRunner.connect();
//     await queryRunner.startTransaction();
//     this.log('Start cleaning unused steps', this.cleanTrashSteps.name, session);
//     try {
//       const data = await queryRunner.query(`
//           WITH active_journeys AS (
//             SELECT id, "visualLayout"
//             FROM journey
//             WHERE "isActive" = true or "isPaused" = true or "isStopped" = true or "isDeleted" = true
//         )

//         , step_ids_to_keep AS (
//             SELECT
//                 aj.id as journey_id,
//                 (node->'data'->>'stepId')::uuid as step_id
//             FROM active_journeys aj
//             CROSS JOIN LATERAL jsonb_array_elements("visualLayout"->'nodes') as node
//             WHERE node->'data' ? 'stepId'
//         )

//         DELETE FROM step s
//         WHERE s."journeyId" IN (SELECT id FROM active_journeys)
//         AND (s."journeyId", s.id) NOT IN (SELECT journey_id, step_id FROM step_ids_to_keep);
//       `);
//       await queryRunner.commitTransaction();
//       this.log(
//         `Finish cleaning unused steps, removed: ${data[1]}`,
//         this.cleanTrashSteps.name,
//         session
//       );
//     } catch (e) {
//       await queryRunner.rollbackTransaction();
//       this.error(e, this.cleanTrashSteps.name, session);
//     } finally {
//       await queryRunner.release();
//     }
//   }

//   @Cron(CronExpression.EVERY_MINUTE)
//   async handleEntryTiming() {
//     const session = randomUUID();
//     let triggerStartTasks;
//     const queryRunner = this.dataSource.createQueryRunner();
//     const client = await queryRunner.connect();
//     await queryRunner.startTransaction();
//     try {
//       // Step 1: Find all journeys that are delayed
//       const delayedJourneys = await queryRunner.manager
//         .createQueryBuilder(Journey, 'journey')
//         .leftJoinAndSelect('journey.workspace', 'workspace') // Assuming 'owner' is the relation property in the Journey entity
//         .leftJoinAndSelect('workspace.organization', 'organization') // Assuming 'owner' is the relation property in the Journey entity
//         .leftJoinAndSelect('organization.owner', 'account') // Assuming 'owner' is the relation property in the Journey entity
//         .leftJoinAndSelect('account.teams', 'teams') // Assuming 'owner' is the relation property in the Journey entity
//         .leftJoinAndSelect('teams.organization', 'organization_two') // Assuming 'owner' is the relation property in the Journey entity
//         .leftJoinAndSelect('organization_two.workspaces', 'workspaces') // Assuming 'owner' is the relation property in the Journey entity
//         .where(
//           'journey."journeyEntrySettings"->\'entryTiming\'->>\'type\' = :type AND journey."isActive" = true',
//           {
//             type: EntryTiming.SpecificTime,
//           }
//         )
//         .getMany();
//       // Step 2: Filter all journeys that are eligible to be re-enrolled
//       for (
//         let journeysIndex = 0;
//         journeysIndex < delayedJourneys.length;
//         journeysIndex++
//       ) {
//         let enroll = false;
//         if (
//           delayedJourneys[journeysIndex].journeyEntrySettings?.entryTiming.time
//             .frequency === EntryTimingFrequency.Once
//         ) {
//           if (
//             new Date(
//               delayedJourneys[
//                 journeysIndex
//               ].journeyEntrySettings?.entryTiming.time.startDate
//             ).getTime() < Date.now() &&
//             +delayedJourneys[journeysIndex].enrollment_count === 0
//           ) {
//             enroll = true;
//           }
//         } else if (
//           delayedJourneys[journeysIndex].journeyEntrySettings?.entryTiming.time
//             .recurrence.endsOn === RecurrenceEndsOptions.After &&
//           +delayedJourneys[journeysIndex].journeyEntrySettings?.entryTiming.time
//             .recurrence.endAdditionalValue <=
//             delayedJourneys[journeysIndex].enrollment_count - 1
//         ) {
//           continue;
//         } else if (
//           delayedJourneys[journeysIndex].journeyEntrySettings?.entryTiming.time
//             .recurrence.endsOn === RecurrenceEndsOptions.SpecificDate &&
//           new Date(
//             delayedJourneys[
//               journeysIndex
//             ].journeyEntrySettings?.entryTiming.time.recurrence.endAdditionalValue
//           ).getTime() <= Date.now()
//         ) {
//           continue;
//         } else {
//           // TODO: Recurring enrollment
//         }
//         if (enroll) {
//           this.log(
//             `Starting enrollment for journey ${delayedJourneys[journeysIndex].id}`,
//             this.handleEntryTiming.name,
//             session
//           );
//           const { collectionName, count } =
//             await this.customersService.getAudienceSize(
//               delayedJourneys[journeysIndex].workspace.organization.owner,
//               delayedJourneys[journeysIndex].inclusionCriteria,
//               session,
//               null
//             );
//           // if (collectionName) collectionNames.push(collectionName);
//           // Step 3: Edit journey details
//           await queryRunner.manager.save(Journey, {
//             ...delayedJourneys[journeysIndex],
//             enrollment_count:
//               delayedJourneys[journeysIndex].enrollment_count + 1,
//             last_enrollment_timestamp: Date.now(),
//           });
//           // Step 4: Reenroll customers that have been unenrolled
//           triggerStartTasks = await this.stepsService.triggerStart(
//             delayedJourneys[journeysIndex].workspace.organization.owner,
//             delayedJourneys[journeysIndex],
//             delayedJourneys[journeysIndex].inclusionCriteria,
//             delayedJourneys[journeysIndex]?.journeySettings?.maxEntries
//               ?.enabled &&
//               count >
//                 parseInt(
//                   delayedJourneys[journeysIndex]?.journeySettings?.maxEntries
//                     ?.maxEntries
//                 )
//               ? parseInt(
//                   delayedJourneys[journeysIndex]?.journeySettings?.maxEntries
//                     ?.maxEntries
//                 )
//               : count,
//             queryRunner,
//             client,
//             session,
//             collectionName
//           );
//           // if (triggerStartTasks.collectionName)
//           //   collectionNames.push(triggerStartTasks.collectionName);
//         }
//       }
//       await queryRunner.commitTransaction();
//       // for (const collection of collectionNames) {
//       //   await this.connection.dropCollection(collection);
//       // }
//       if (triggerStartTasks?.job)
//         await this.startQueue.add(
//           triggerStartTasks.job.name,
//           triggerStartTasks.job.data
//         );
//     } catch (e) {
//       this.error(e, this.handleEntryTiming.name, session);
//       await queryRunner.rollbackTransaction();
//     } finally {
//       await queryRunner.release();
//     }
//   }
// }
// */
