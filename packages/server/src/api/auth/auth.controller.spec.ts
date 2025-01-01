import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthHelper } from './auth.helper';
import { ApiKeyStrategy } from './strategies/apiKey.strategy';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { Account } from '../accounts/entities/accounts.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import { TypeOrmConfigService } from '../../shared/typeorm/typeorm.service';
import * as winston from 'winston';
import { Verification } from './entities/verification.entity';
import { Recovery } from './entities/recovery.entity';
import { CustomersModule } from '../customers/customers.module';

const papertrail = new winston.transports.Http({
  host: 'logs.collector.solarwinds.com',
  path: '/v1/log',
  auth: { username: 'papertrail', password: process.env.PAPERTRAIL_API_KEY },
  ssl: true,
});

describe('AuthController', () => {
  let usersController: AuthController;

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
        PassportModule.register({
          defaultStrategy: 'jwt',
          property: 'user',
        }),
        JwtModule.register({
          secret: 'JWT_KEY',
          signOptions: { expiresIn: '60s' },
        }),
        TypeOrmModule.forFeature([Account, Recovery, Verification]),
        CustomersModule,
      ],
      controllers: [AuthController],
      providers: [AuthService, AuthHelper, JwtStrategy, ApiKeyStrategy],
    }).compile();

    usersController = app.get<AuthController>(AuthController);
    // usersService = app.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(usersController).toBeDefined();
  });
});
