import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SegmentCustomersService } from './segment-customers.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SegmentCustomers } from './entities/segment-customers.entity';
import { Account } from '../accounts/entities/accounts.entity';
import { Repository } from 'typeorm';

// to run: npm run test -- cache.service.spec --watch
describe('SegmentCustomersService', () => {
  let segmentCustomersService: SegmentCustomersService;
  // let accountsRepository: Repository<Account>;
  // let segmentCustomersRepository: Repository<SegmentCustomers>;

  beforeEach(async () => {
    const app = await Test.createTestingModule({
      providers: [
        SegmentCustomersService,
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: {
            log: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SegmentCustomers),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOneBy: jest.fn().mockResolvedValue([]),
            save: jest.fn().mockResolvedValue([]),
            remove: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Account),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOneBy: jest.fn().mockResolvedValue([]),
            save: jest.fn().mockResolvedValue([]),
            remove: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    segmentCustomersService = app.get<SegmentCustomersService>(
      SegmentCustomersService
    );
    // segmentCustomersRepository = app.get(Repository<SegmentCustomers>);
    // accountsRepository = app.get(Repository<Account>);
  });

  describe('create', () => {
    it('should create a segment customer row with a query runner', async () => {});

    it('should create a segment customer row without a query runner', async () => {});

    it('should create a segment customer row using the _id field and other_ids field of a customer document', async () => {});

    it('should fail to create a segment customer row without all the required parameters', async () => {});

    it('should fail to create a segment customer row if that row already exists', async () => {});
  });

  describe('delete', () => {
    it('should delete a segment customer row with a query runner', async () => {});

    it('should delete a segment customer row without a query runner', async () => {});

    it('should delete a segment customer row using the _id field and other_ids field of a customer document', async () => {});

    it('should fail to delete a segment customer row without all the required parameters', async () => {});

    it('should fail to delete a segment customer row if that row does not exist', async () => {});
  });

  describe('addBulk', () => {
    it('should bulk add rows using the COPY command', async () => {});
  });

  describe('removeBulk', () => {
    it('should remove all the customers in a segment', async () => {});
  });

  describe('getNumberOfCustomersInSegment', () => {
    it('should return the number of customers in a segment', async () => {});
  });
});
