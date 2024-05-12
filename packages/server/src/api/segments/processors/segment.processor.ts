import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
  InjectQueue,
} from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import * as _ from 'lodash';
import * as Sentry from '@sentry/node';
import { Account } from '../../accounts/entities/accounts.entity';
import { Segment } from '../entities/segment.entity';
import { SegmentsService } from '../segments.service';
import { CustomersService } from '@/api/customers/customers.service';
import { CreateSegmentDTO } from '../dto/create-segment.dto';
import { InjectConnection } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { SegmentCustomers } from '../entities/segment-customers.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateSegmentDTO } from '../dto/update-segment.dto';
import { Workspaces } from '@/api/workspaces/entities/workspaces.entity';

@Injectable()
@Processor('segment_update')
export class SegmentUpdateProcessor extends WorkerHost {
  private providerMap = {
    updateDynamic: this.handleUpdateDynamic,
    updateManual: this.handleUpdateManual,
    createDynamic: this.handleCreateDynamic,
  };
  constructor(
    private dataSource: DataSource,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @Inject(SegmentsService) private segmentsService: SegmentsService,
    @Inject(forwardRef(() => CustomersService))
    private customersService: CustomersService,
    @InjectConnection() private readonly connection: mongoose.Connection,
    @InjectQueue('customer_change')
    private readonly customerChangeQueue: Queue,
    @InjectRepository(SegmentCustomers)
    private segmentCustomersRepository: Repository<SegmentCustomers>
  ) {
    super();
  }

  log(message, method, session, user = 'ANONYMOUS') {
    this.logger.log(
      message,
      JSON.stringify({
        class: SegmentUpdateProcessor.name,
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
        class: SegmentUpdateProcessor.name,
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
        class: SegmentUpdateProcessor.name,
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
        class: SegmentUpdateProcessor.name,
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
        class: SegmentUpdateProcessor.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }

  /*
   *
   *
   */
  async process(job: any): Promise<any> {
    const fn = this.providerMap[job.name];
    const that = this;

    return Sentry.startSpan(
      { name: `${SegmentUpdateProcessor.name}.${fn.name}` },
      async () => {
        await fn.call(that, job);
      }
    );
  }

  async handleCreateDynamic(
    job: Job<
      {
        account: Account;
        segment: Segment;
        session: string;
        createSegmentDTO: CreateSegmentDTO;
      },
      any,
      string
    >
  ) {
    let err: any;
    await this.customerChangeQueue.pause();
    while (true) {
      const jobCounts = await this.customerChangeQueue.getJobCounts('active');
      const activeJobs = jobCounts.active;

      if (activeJobs === 0) {
        break; // Exit the loop if the number of waiting jobs is below the threshold
      }

      this.warn(
        `Waiting for the queue to clear. Current active jobs: ${activeJobs}`,
        this.process.name,
        job.data.session
      );
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Sleep for 1 second before checking again
    }
    const queryRunner = await this.dataSource.createQueryRunner();
    const client = await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const collectionPrefix = this.segmentsService.generateRandomString();
      const customersInSegment =
        await this.customersService.getSegmentCustomersFromQuery(
          job.data.createSegmentDTO.inclusionCriteria.query,
          job.data.account,
          job.data.session,
          true,
          0,
          collectionPrefix
        );

      const batchSize = 500; // Set an appropriate batch size
      const collectionName = customersInSegment; // Name of the MongoDB collection
      const mongoCollection = this.connection.db.collection(collectionName);
      let processedCount = 0;
      const totalDocuments = await mongoCollection.countDocuments();

      while (processedCount < totalDocuments) {
        // Fetch a batch of documents
        const customerDocuments = await mongoCollection
          .find({})
          .skip(processedCount)
          .limit(batchSize)
          .toArray();
        // Map the MongoDB documents to SegmentCustomers entities
        const segmentCustomersArray: SegmentCustomers[] = customerDocuments.map(
          (doc) => {
            const segmentCustomer = new SegmentCustomers();
            segmentCustomer.customerId = doc._id.toString();
            segmentCustomer.segment = job.data.segment.id;
            segmentCustomer.workspace =
              job.data.account?.teams?.[0]?.organization?.workspaces?.[0];
            // Set other properties as needed
            return segmentCustomer;
          }
        );
        // Batch insert into PostgreSQL database
        await queryRunner.manager.save(SegmentCustomers, segmentCustomersArray);
        // Update the count of processed documents
        processedCount += customerDocuments.length;
      }

      try {
        await this.segmentsService.deleteCollectionsWithPrefix(
          collectionPrefix
        );
      } catch (e) {
        this.error(
          e,
          this.process.name,
          job.data.session,
          job.data.account.email
        );
      }

      await queryRunner.manager.save(Segment, {
        ...job.data.segment,
        isUpdating: false,
      });
      await queryRunner.commitTransaction();
    } catch (e) {
      this.error(
        e,
        this.process.name,
        job.data.session,
        job.data.account.email
      );
      await queryRunner.rollbackTransaction();
      err = e;
    } finally {
      await queryRunner.release();
      await this.customerChangeQueue.resume();
      if (err) throw err;
    }
  }

  async handleUpdateDynamic(
    job: Job<
      {
        account: Account;
        id: string;
        session: string;
        updateSegmentDTO: UpdateSegmentDTO;
        workspace: Workspaces;
      },
      any,
      string
    >
  ) {
    let err: any;
    await this.customerChangeQueue.pause();
    while (true) {
      const jobCounts = await this.customerChangeQueue.getJobCounts('active');
      const activeJobs = jobCounts.active;

      if (activeJobs === 0) {
        break; // Exit the loop if the number of waiting jobs is below the threshold
      }

      this.warn(
        `Waiting for the queue to clear. Current active jobs: ${activeJobs}`,
        this.process.name,
        job.data.session
      );
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Sleep for 1 second before checking again
    }
    const queryRunner = await this.dataSource.createQueryRunner();
    const client = await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const segment = await this.segmentsService.findOne(
        job.data.account,
        job.data.id,
        job.data.session
      );
      const forDelete = await this.segmentCustomersRepository.findBy({
        segment: segment.id,
      });

      for (const { customerId } of forDelete) {
        const customer = await this.customersService.CustomerModel.findById(
          customerId
        ).exec();
        await this.segmentsService.updateAutomaticSegmentCustomerInclusion(
          job.data.account,
          customer,
          job.data.session
        );
        await this.customersService.recheckDynamicInclusion(
          job.data.account,
          customer,
          job.data.session
        );
      }

      const amount = await this.customersService.CustomerModel.count({
        workspaceId: job.data.workspace.id,
      });

      const batchOptions = {
        current: 0,
        documentsCount: amount || 0,
        batchSize: 500,
      };

      while (batchOptions.current < batchOptions.documentsCount) {
        const batch = await this.customersService.CustomerModel.find({
          workspaceId: job.data.workspace.id,
        })
          .skip(batchOptions.current)
          .limit(batchOptions.batchSize)
          .exec();

        for (const customer of batch) {
          await this.segmentsService.updateAutomaticSegmentCustomerInclusion(
            job.data.account,
            customer,
            job.data.session
          );
        }

        batchOptions.current += batchOptions.batchSize;
      }

      const records = await this.segmentCustomersRepository.findBy({
        segment: segment.id, //{ id: segment.id },
      });

      for (const { customerId } of records) {
        const customer = await this.customersService.CustomerModel.findById(
          customerId
        ).exec();
        await this.customersService.recheckDynamicInclusion(
          job.data.account,
          customer,
          job.data.session
        );
      }

      await queryRunner.manager.save(Segment, {
        ...segment,
        isUpdating: false,
      });
      await queryRunner.commitTransaction();
    } catch (e) {
      this.error(
        e,
        this.process.name,
        job.data.session,
        job.data.account.email
      );
      await queryRunner.rollbackTransaction();
      err = e;
    } finally {
      await queryRunner.release();
      await this.customerChangeQueue.resume();
      if (err) throw err;
    }
  }

  async handleUpdateManual(
    job: Job<
      {
        account: Account;
        segment: Segment;
        session: string;
        csvFile: any;
      },
      any,
      string
    >
  ) {
    let err: any;
    const queryRunner = await this.dataSource.createQueryRunner();
    const client = await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const { stats } = await this.customersService.loadCSV(
        job.data.account,
        job.data.csvFile,
        job.data.session
      );

      await this.segmentsService.assignCustomers(
        job.data.account,
        job.data.segment.id,
        stats.customers,
        job.data.session
      );

      await queryRunner.manager.save(Segment, {
        ...job.data.segment,
        isUpdating: false,
      });
      await queryRunner.commitTransaction();
    } catch (e) {
      this.error(
        e,
        this.handleUpdateManual.name,
        job.data.session,
        job.data.account.email
      );
      await queryRunner.rollbackTransaction();
      err = e;
    } finally {
      await queryRunner.release();
      if (err) throw err;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error, prev?: string) {
    Sentry.withScope((scope) => {
      scope.setTag('job_id', job.id);
      scope.setTag('processor', SegmentUpdateProcessor.name);
      Sentry.captureException(error);
    });
  }
}
