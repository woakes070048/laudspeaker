import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Workspaces } from './workspaces.entity';
import { ResendSendingOption } from './resend-sending-option.entity';

@Entity()
export class WorkspaceResendConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @JoinColumn()
  @ManyToOne(() => Workspaces, (workspace) => workspace.id, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  workspace: Workspaces;

  @Column()
  name: string;

  @Column()
  apiKey: string;

  @Column()
  signingSecret: string;

  @Column()
  sendingDomain: string;

  @OneToMany(() => ResendSendingOption, (option) => option.resendConnection)
  sendingOptions: ResendSendingOption[];

  @Column()
  workspaceId: string;
}
