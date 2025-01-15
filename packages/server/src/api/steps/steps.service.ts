import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, QueryRunner, Repository } from 'typeorm';
import { Step } from './entities/step.entity';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';
import { Account } from '../accounts/entities/accounts.entity';
import Errors from '../../shared/utils/errors';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Queue } from 'bullmq';
import { StepType } from './types/step.interface';
import { Requeue } from './entities/requeue.entity';
import { JourneyLocationsService } from '../journeys/journey-locations.service';
import { CustomersService } from '../customers/customers.service';
import { Journey } from '../journeys/entities/journey.entity';
import * as Sentry from '@sentry/node';
import {
  ClickHouseTable,
  ClickHouseClient
} from '../../common/services/clickhouse';
import { CacheService } from '../../common/services/cache.service';
import { CacheConstants } from '../../common/services/cache.constants';
import { Query } from '../../common/services/query';

@Injectable()
export class StepsService {
  /**
   * Step service constructor; this class is the only class that should
   * be using the Steps repository (`Repository<Step>`) directly.
   * @class
   */
  constructor(
    private dataSource: DataSource,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectRepository(Step)
    public stepsRepository: Repository<Step>,
    @InjectRepository(Requeue)
    public requeueRepository: Repository<Requeue>,
    @Inject(JourneyLocationsService)
    private readonly journeyLocationsService: JourneyLocationsService,
    @Inject(forwardRef(() => CustomersService))
    private readonly customersService: CustomersService,
    @Inject(ClickHouseClient)
    private clickhouseClient: ClickHouseClient,
    @Inject(CacheService) private cacheService: CacheService,
  ) {}

  log(message, method, session, user = 'ANONYMOUS') {
    this.logger.log(
      message,
      JSON.stringify({
        class: StepsService.name,
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
        class: StepsService.name,
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
        class: StepsService.name,
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
        class: StepsService.name,
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
        class: StepsService.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }

  /**
   * Add array of customer documents to starting step of a journey. Calls
   * addToStart under the hood.
   * @param account
   * @param journeyID
   * @param unenrolledCustomers
   * @param queryRunner
   * @param session
   */
  // async bulkAddToStart(
  //   account: Account,
  //   journeyID: string,
  //   customers: CustomerDocument[],
  //   queryRunner: QueryRunner,
  //   session: string
  // ) {
  //   for (let i = 0; i < customers.length; i++) {
  //     await this.addToStart(
  //       account,
  //       journeyID,
  //       customers[i],
  //       queryRunner,
  //       session
  //     );
  //   }
  // }

  /**
   * Add array of customer documents to starting step of a journey
   * @param account
   * @param journeyID
   * @param query
   * @param queryRunner
   * @param session
   */
  async triggerStart(
    account: Account,
    journey: Journey,
    queryJSON: any,
    session: string,
  ): Promise<{ jobData: any }> {
    return Sentry.startSpan({ name: 'StepsService.triggerStart' }, async () => {
      const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

      const startStep = await this.getStartStep(
        account,
        journey,
        session);

      if (!startStep)
        throw new Error('Could not find start step.');

      const query: Query = Query.fromJSON(queryJSON);
      query.setContext({
        "journey_id": journey.id,
        "step_id": startStep.id,
        "workspace_id": workspace.id,
      });

      const nCustomers = await query.count(this.dataSource);

      // -      while (batch * CUSTOMERS_PER_BATCH <= audienceSize) {
      // -        const customers = await this.customersService.find(
      // -          account,
      // -          query,
      // -          session,
      // -          batch * CUSTOMERS_PER_BATCH,
      // -          CUSTOMERS_PER_BATCH,
      // -          collectionName

      await this.journeyLocationsService.createAndLockBulk(
        account,
        journey.id,
        queryJSON,
        startStep.id,
        session,
      );

      return {
        jobData: {
          owner: account,
          step: startStep[0],
          journey,
          session: session,
          queryJSON,
          skip: 0,
          limit: nCustomers,
        },
      };
    });
  }

  /**
   * Find all steps belonging to an account.
   * @param account
   * @param session
   * @returns
   */
  async findAll(account: Account, session: string): Promise<Step[]> {
    const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

    try {
      return await this.stepsRepository.findBy({
        workspace: { id: workspace.id },
      });
    } catch (e) {
      this.error(e, this.findAll.name, session, account.id);
      throw e;
    }
  }

  /**
   * Find all steps of a certain type (owner optional).
   * @param account
   * @param type
   * @param session
   * @returns
   */
  async findAllByType(
    account: Account,
    type: StepType,
    session: string
  ): Promise<Step[]> {
    try {
      const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

      return await this.stepsRepository.findBy({
        workspace: account && workspace ? { id: workspace.id } : undefined,
        type: type,
      });
    } catch (e) {
      this.error(e, this.findAllByType.name, session, account.id);
      throw e;
    }
  }

  /**
   * Find all steps of a certain type on a journey (owner optional).
   * @param account
   * @param type
   * @param session
   * @returns
   */
  async transactionalfindAllByTypeInJourney(
    account: Account,
    type: StepType,
    journeyID: string,
    queryRunner: QueryRunner,
    session: string
  ): Promise<Step[]> {
    try {
      const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

      return await queryRunner.manager.findBy(Step, {
        workspace: account && workspace ? { id: workspace.id } : undefined,

        journey: { id: journeyID },
        type: type,
      });
    } catch (e) {
      this.error(e, this.findAllByType.name, session, account.id);
      throw e;
    }
  }

  /**
   * Find all steps of a certain type using db transaction(owner optional).
   * @param account
   * @param type
   * @param session
   * @returns
   */
  async transactionalFindAllByType(
    account: Account,
    type: StepType,
    session: string,
    queryRunner: QueryRunner
  ): Promise<Step[]> {
    try {
      const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

      return await queryRunner.manager.findBy(Step, {
        workspace: account && workspace ? { id: workspace.id } : undefined,
        type: type,
      });
    } catch (e) {
      this.error(e, this.findAllByType.name, session, account.id);
      throw e;
    }
  }

  /**
   * Find all steps of a certain type using db transaction(owner optional).
   * @param account
   * @param type
   * @param session
   * @returns
   */
  async transactionalFindAllActiveByType(
    account: Account,
    type: StepType,
    session: string,
    queryRunner: QueryRunner
  ): Promise<Step[]> {
    try {
      const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

      return await queryRunner.manager.find(Step, {
        where: {
          workspace: account && workspace ? { id: workspace.id } : undefined,

          type: type,
          journey: {
            isActive: true,
            isDeleted: false,
            isPaused: false,
            isStopped: false,
            isEnrolling: false,
          },
        },
        relations: ['owner'],
      });
    } catch (e) {
      this.error(e, this.findAllByType.name, session, account.id);
      throw e;
    }
  }

  /**
   * Find all steps of a certain type using db transaction(owner optional).
   * @param type
   * @param journeyID
   * @param session
   * @param queryRunner
   * @returns
   */
  async transactionalFindAllActiveByTypeAndJourney(
    type: StepType,
    journeyID: string,
    session: string,
    queryRunner: QueryRunner
  ): Promise<Step[]> {
    try {
      return await queryRunner.manager.find(Step, {
        where: {
          journey: { id: journeyID },
          type: type,
        },
        relations: ['journey'],
      });
    } catch (e) {
      this.error(e, this.findAllByType.name, session);
      throw e;
    }
  }

  /**
   * Find all steps that are terminal in a journey
   * @param journeyID
   * @param session
   * @param select
   * @returns
   */
  async findAllTerminalInJourney(
    journeyID: string,
    session: string,
    select?: string[]
  ): Promise<Step[]> {
    try {
      let query = this.stepsRepository
        .createQueryBuilder('step')
        .where({ journeyId: journeyID })
        .andWhere("metadata -> 'destination' IS NULL")
        .andWhere("metadata -> 'timeBranch' -> 'destination' IS NULL")
        .andWhere(`NOT EXISTS (
                  select branch ->> 'destination' AS "destination"
                  from jsonb_array_elements(metadata -> 'branches') AS "branch"
                  WHERE 'destination' IS NOT NULL)`);

      if (select) query = query.select(select);

      let res = await query.getMany();

      return res;

      // return await queryRunner.manager.find(Step, {
      //   where: {
      //     journey: { id: journeyID },
      //     type: type,
      //   },
      //   relations: ['journey'],
      // });
    } catch (e) {
      this.error(e, this.findAllTerminalInJourney.name, session);
      throw e;
    }
  }

  /**
   * Find a step by its ID.
   * @param account
   * @param id
   * @param session
   * @returns
   */
  async findOne(
    account: Account,
    id: string,
    session: string
  ): Promise<Step | null> {
    try {
      const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

      return await this.stepsRepository.findOneBy({
        workspace: { id: workspace.id },
        id: id,
      });
    } catch (e) {
      this.error(e, this.findOne.name, session, account.id);
      throw e;
    }
  }

  /**
   * Finds the start step by journey and workspace. Caches the step for next lookup
   * @param account
   * @param journeyId
   * @param session
   * @returns
   */
  async getStartStep(
    account: Account,
    journey: Journey,
    session: string
  ): Promise<Step | null> {
    const startStep = await this.cacheService.getIgnoreError(
      CacheConstants.JOURNEY_WORKSPACE_START_STEPS,
      journey.id,
      async () => {
        return await this.findByJourneyAndType(
          account,
          journey,
          StepType.START,
          session);
        }
    );

    return startStep;
  }

  /**
   * Find a step by journey, workspace and type
   * @param account
   * @param journey
   * @param type
   * @param session
   * @returns
   */
  async findByJourneyAndType(
    account: Account,
    journey: Journey,
    type: StepType,
    session: string,
    queryRunner?: QueryRunner
  ): Promise<Step | null> {
    const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

    if (queryRunner) {
      return await queryRunner.manager.findOne(Step, {
        where: {
          journeyId: journey.id,
          workspaceId: workspace.id,
          type: type,
        },
      });
    } else {
      return await this.stepsRepository.findOne({
        where: {
          journeyId: journey.id,
          workspaceId: workspace.id,
          type: type,
        },
      });
    }
  }

  /**
   * Find a step by its ID, account optional
   *
   * @param account
   * @param id
   * @param session
   * @returns
   */
  async findByID(
    id: string,
    session: string,
    account?: Account,
    queryRunner?: QueryRunner
  ): Promise<Step | null> {
    const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];
    if (queryRunner) {
      return await queryRunner.manager.findOne(Step, {
        where: {
          workspace: account && workspace ? { id: workspace.id } : undefined,
          id: id,
        },
        relations: ['workspace.organization.owner', 'journey'],
      });
    } else {
      return await this.stepsRepository.findOne({
        where: {
          workspace: account && workspace ? { id: workspace.id } : undefined,
          id: id,
        },
        relations: ['workspace.organization.owner', 'journey'],
      });
    }
  }

  /**
   * Find a step by its ID, dont load any relations
   * @param id
   * @param queryRunner
   * @returns
   */
  async lazyFindByID(
    id: string,
    queryRunner?: QueryRunner
  ): Promise<Step | null> {
    if (queryRunner) {
      return await queryRunner.manager.findOne(Step, {
        where: {
          id: id,
        },
      });
    } else {
      return await this.stepsRepository.findOne({
        where: {
          id: id,
        },
      });
    }
  }

  /**
   * Insert a new step.
   * TODO: Check step metadata matches step type
   * @param account
   * @param createStepDto
   * @param session
   * @returns
   */
  async insert(
    account: Account,
    createStepDto: CreateStepDto,
    session: string
  ): Promise<Step> {
    try {
      const { journeyID, type } = createStepDto;
      const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

      return await this.stepsRepository.save({
        customers: [],
        workspace: { id: workspace.id },
        journey: { id: journeyID },
        type,
      });
    } catch (e) {
      this.error(e, this.insert.name, session, account.id);
      throw e;
    }
  }

  /**
   * Insert a new step using a db transaction.
   * TODO: Check step metadata matches step type
   * @param account
   * @param createStepDto
   * @param session
   * @returns
   */
  async transactionalInsert(
    account: Account,
    createStepDto: CreateStepDto,
    queryRunner: QueryRunner,
    session: string
  ): Promise<Step> {
    try {
      account = await queryRunner.manager.findOne(Account, {
        where: { id: account.id },
        relations: ['teams.organization.workspaces'],
      });

      const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

      const { journeyID, type } = createStepDto;
      return await queryRunner.manager.save(Step, {
        customers: [],
        workspace: { id: workspace.id },
        journey: { id: journeyID },
        type,
      });
    } catch (e) {
      this.error(e, this.insert.name, session, account.id);
      throw e;
    }
  }

  /**
   * Find all steps associated with a journey using DB transaction.
   * @param account
   * @param id
   * @param queryRunner
   * @returns
   */
  async transactionalfindByJourneyID(
    account: Account,
    id: string,
    queryRunner: QueryRunner
  ) {
    const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

    return await queryRunner.manager.find(Step, {
      where: {
        workspace: { id: workspace.id },
        journey: { id: id },
      },
      relations: ['workspace'],
    });
  }

  /**
   * Update a step. If the step's journey is already started this throws an error.
   * TODO: Check that step metadta matches step type.
   * @param account
   * @param updateStepDto
   * @param session
   * @returns
   */
  async update(
    account: Account,
    updateStepDto: UpdateStepDto,
    session: string
  ): Promise<Step> {
    try {
      const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

      const step = await this.stepsRepository.findOneBy({
        workspace: { id: workspace.id },
        id: updateStepDto.id,
      });
      if (!step) {
        throw new Error(Errors.ERROR_DOES_NOT_EXIST);
      }
      if (
        step.journey.isActive ||
        step.journey.isDeleted ||
        step.journey.isStopped
      )
        throw new Error(
          'This step is part of a Journey that is already in progress.'
        );

      return await this.stepsRepository.save({
        ...step,
        type: updateStepDto.type,
        metadata: updateStepDto.metadata,
      });
    } catch (e) {
      this.error(e, this.update.name, session, account.id);
      throw e;
    }
  }

  /**
   * Delete a step.
   * @param account
   * @param id
   * @param session
   */
  async delete(account: Account, id: string, session: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const workspace = account.teams?.[0]?.organization?.workspaces?.[0];
      await queryRunner.query(
        `
          WITH RECURSIVE nodes_to_delete AS (
            SELECT 
                id, 
                metadata->'branches' AS branches, 
                (metadata->>'destination')::uuid AS destination,
                CASE 
                    WHEN jsonb_array_length(metadata->'branches') IS NULL OR jsonb_array_length(metadata->'branches') = 1 THEN FALSE
                    ELSE TRUE
                END as recursive_delete
            FROM step
            WHERE id = $1::uuid and "workspaceId" = $2::uuid
            
            UNION
            
            SELECT 
                t.id, 
                t.metadata->'branches' AS branches, 
                (t.metadata->>'destination')::uuid AS destination,
                ntd.recursive_delete
            FROM step t
            INNER JOIN nodes_to_delete ntd 
            ON (t.id = ntd.destination OR t.id IN (SELECT (value->>'destination')::uuid FROM jsonb_array_elements(ntd.branches))) 
            AND ntd.recursive_delete = TRUE
        )
        DELETE FROM step WHERE id IN (SELECT id FROM nodes_to_delete);
      `,
        [id, workspace.id]
      );
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      this.error(e, this.delete.name, session, account.email);
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get sending statistics for a step.
   * @param stepID
   * @returns
   */
  async getStats(account: Account, session: string, stepId?: string) {
    if (!stepId) return {};
    const sentResponse = await this.clickhouseClient.query({
      query: `SELECT COUNT(*) AS count FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event = 'sent' AND stepId = {stepId:UUID}`,
      query_params: { stepId },
    });
    const sentData = (await sentResponse.json<any>())?.data;
    const sent = +sentData[0].count;

    const deliveredResponse = await this.clickhouseClient.query({
      query: `SELECT COUNT(*) AS count FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event = 'delivered' AND stepId = {stepId:UUID}`,
      query_params: { stepId },
    });
    const deliveredData = (await deliveredResponse.json<any>())?.data;
    const delivered = +deliveredData[0].count;

    const openedResponse = await this.clickhouseClient.query({
      query: `SELECT COUNT(DISTINCT(stepId, customerId, templateId, messageId, event, eventProvider)) AS count FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event = 'opened' AND stepId = {stepId:UUID}`,
      query_params: { stepId },
    });
    const openedData = (await openedResponse.json<any>())?.data;
    const opened = +openedData[0].count;

    const openedPercentage = (opened / sent) * 100;

    const clickedResponse = await this.clickhouseClient.query({
      query: `SELECT COUNT(DISTINCT(stepId, customerId, templateId, messageId, event, eventProvider)) AS count FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event = 'clicked' AND stepId = {stepId:UUID}`,
      query_params: { stepId },
    });
    const clickedData = (await clickedResponse.json<any>())?.data;
    const clicked = +clickedData[0].count;

    const clickedPercentage = (clicked / sent) * 100;

    const whResponse = await this.clickhouseClient.query({
      query: `SELECT COUNT(*) AS count FROM ${ClickHouseTable.MESSAGE_STATUS} WHERE event = 'sent' AND stepId = {stepId:UUID} AND eventProvider = 'webhooks' `,
      query_params: {
        stepId,
      },
    });
    const wsData = (await whResponse.json<any>())?.data;
    const wssent = +wsData[0].count;

    return {
      sent,
      delivered,
      openedPercentage,
      clickedPercentage,
      wssent,
    };
  }
  async requeueMessage(
    account: Account,
    step: Step,
    customerId: string,
    requeueTime: Date,
    session: string,
    queryRunner?: QueryRunner
  ) {
    const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

    if (queryRunner) {
      await queryRunner.manager.save(Requeue, {
        workspace: workspace,
        step,
        customerId,
        requeueAt: requeueTime.toISOString(),
      });
    } else {
      await this.requeueRepository.save({
        workspace: workspace,
        step,
        customerId,
        requeueAt: requeueTime.toISOString(),
      });
    }
  }

  async deleteRequeueMessage(
    account: Account,
    step: Step,
    customerId: string,
    session: string,
    queryRunner: QueryRunner
  ) {
    const workspace = account?.teams?.[0]?.organization?.workspaces?.[0];

    await queryRunner.manager.delete(Requeue, {
      workspace: { id: workspace.id },
      step: { id: step.id },
      customerId: customerId,
    });
  }

  async getRequeuedMessages(session, queryRunner: QueryRunner) {
    return await queryRunner.manager.find(Requeue, {
      where: {
        requeueAt: LessThanOrEqual(new Date()),
      },
      relations: { workspace: { organization: true }, step: { journey: true } },
    });
  }
}
