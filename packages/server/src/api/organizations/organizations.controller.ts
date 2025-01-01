import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { RavenInterceptor } from 'nest-raven';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DisconnectFirebaseDTO } from '../accounts/dto/disconnect-firebase.dto';
import { Account } from '../accounts/entities/accounts.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { S3Service } from '../s3/s3.service';
import { CreateOrganizationDTO } from './dto/create-ogranization.dto';
import { InviteMemberDTO } from './dto/invite-user.dto';
import { UpdateOrganizationDTO } from './dto/update-organization.dto';
import { OrganizationService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    private readonly s3Service: S3Service,
    @Inject(OrganizationService)
    public organizationService: OrganizationService
  ) {}

  log(message, method, session, user = 'ANONYMOUS') {
    this.logger.log(
      message,
      JSON.stringify({
        class: OrganizationsController.name,
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
        class: OrganizationsController.name,
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
        class: OrganizationsController.name,
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
        class: OrganizationsController.name,
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
        class: OrganizationsController.name,
        method: method,
        session: session,
        user: user,
      })
    );
  }

  // Need logic update on multiple teams management
  @Get('/team-members')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor, new RavenInterceptor())
  async getTeamMembers(
    @Req() { user }: Request,
    @Query('take') take?: number,
    @Query('skip') skip?: number,
    @Query('isASC') isASC?: boolean
  ) {
    return this.organizationService.getTeamMembers(
      <Account>user,
      take,
      skip,
      isASC
    );
  }

  @Get('/check-invite-status/:id')
  @UseInterceptors(ClassSerializerInterceptor, new RavenInterceptor())
  async checkInviteStatus(@Param('id') id: string) {
    const session = randomUUID();
    try {
      return await this.organizationService.checkInviteStatus(id, session);
    } catch (error) {
      throw error;
    }
  }

  @Delete('/disconnect-push-chanel')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor, new RavenInterceptor())
  disconnectFirebase(
    @Req() { user }: Request,
    @Body() disconnectFirebaseDTO: DisconnectFirebaseDTO
  ) {
    const session = randomUUID();
    this.debug(
      `Disconnecting firebase platform: ${disconnectFirebaseDTO} by user ${JSON.stringify(
        { id: (<Account>user).id }
      )}`,
      this.disconnectFirebase.name,
      session,
      (<Account>user).id
    );
    try {
      return this.organizationService.disconnectFirebase(
        <Account>user,
        disconnectFirebaseDTO,
        session
      );
    } catch (e) {
      this.error(e, this.disconnectFirebase.name, session, (<Account>user).id);
      throw e;
    }
  }

  @Post('/team-members/invite')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor, new RavenInterceptor())
  async inviteTeamMember(
    @Req() { user }: Request,
    @Body() body: InviteMemberDTO
  ) {
    const session = randomUUID();
    try {
      await this.organizationService.inviteMember(<Account>user, body, session);
    } catch (error) {
      throw error;
    }
  }

  @Post('/transfer-owner-rights/:id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor, new RavenInterceptor())
  async transferOwnerRights(@Req() { user }: Request, @Param('id') id: string) {
    const session = randomUUID();
    try {
      await this.organizationService.transferOwnerRights(
        <Account>user,
        id,
        session
      );
    } catch (error) {
      throw error;
    }
  }

  @Delete('/delete-member/:id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor, new RavenInterceptor())
  async deleteMemberAccount(@Req() { user }: Request, @Param('id') id: string) {
    const session = randomUUID();
    try {
      await this.organizationService.deleteMemberAccount(
        <Account>user,
        id,
        session
      );
    } catch (error) {
      throw error;
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor, new RavenInterceptor())
  async getOrganization(@Req() { user }: Request) {
    return {
      organization: {
        id: (<Account>user)?.teams?.[0]?.organization.id,
        name: (<Account>user)?.teams?.[0]?.organization.companyName,
        ownerId: (<Account>user)?.teams?.[0]?.organization.owner.id,
      },
      workspace: {
        id: (<Account>user)?.teams?.[0]?.organization?.workspaces?.[0]?.id,
        timezoneUTCOffset: (<Account>user)?.teams?.[0]?.organization
          ?.workspaces?.[0]?.timezoneUTCOffset,
      },
    };
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor, new RavenInterceptor())
  async update(@Req() { user }: Request, @Body() body: UpdateOrganizationDTO) {
    const session = randomUUID();
    return this.organizationService.update(<Account>user, body, session);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(ClassSerializerInterceptor, new RavenInterceptor())
  async create(@Req() { user }: Request, @Body() body: CreateOrganizationDTO) {
    const session = randomUUID();
    return this.organizationService.create(<Account>user, body, session);
  }
}
