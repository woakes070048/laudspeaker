import { TypeOrmConfigService } from '../../shared/typeorm/typeorm.service';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import { AuthModule } from '../auth/auth.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { Account } from './entities/accounts.entity';
import * as winston from 'winston';

const papertrail = new winston.transports.Http({
  host: 'logs.collector.solarwinds.com',
  path: '/v1/log',
  auth: { username: 'papertrail', password: process.env.PAPERTRAIL_API_KEY },
  ssl: true,
});

describe('UsersController', () => {
  let accountsController: AccountsController;
  let accountsService: AccountsService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [
        WinstonModule.forRootAsync({
          useFactory: () => ({
            level: 'debug',
            transports: [papertrail],
          }),
          inject: [],
        }),
        TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
        TypeOrmModule.forFeature([Account]),
        AuthModule,
      ],
      controllers: [AccountsController],
      providers: [
        AccountsService,
        {
          provide: AccountsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([
              {
                firstName: 'firstName #1',
                lastName: 'lastName #1',
                email: '1@gmail.com',
              },
              {
                firstName: 'firstName #2',
                lastName: 'lastName #2',
                email: '2@gmail.com',
              },
            ]),
            findOne: jest.fn().mockImplementation((email: string) =>
              Promise.resolve({
                firstName: 'firstName #1',
                lastName: 'lastName #1',
                email,
              })
            ),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    accountsController = app.get<AccountsController>(AccountsController);
    accountsService = app.get<AccountsService>(AccountsService);
  });

  it('should be defined', () => {
    expect(accountsController).toBeDefined();
  });
});
