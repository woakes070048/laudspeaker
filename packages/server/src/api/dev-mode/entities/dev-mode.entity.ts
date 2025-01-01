import { Account } from '../../accounts/entities/accounts.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Journey } from '../../journeys/entities/journey.entity';
import { Workspaces } from '../../workspaces/entities/workspaces.entity';
import {
  BaseEntity,
  Column,
  Entity,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export interface DevModeState {
  customerIn: {
    nodeId: string;
    stepId: string;
  };
  customerData: Customer;
  customerStory: Record<string, Customer>;
}

@Entity()
export class DevMode extends BaseEntity {
  @PrimaryColumn('uuid')
  @JoinColumn({ name: 'workspaceId' })
  @ManyToOne(() => Workspaces, (workspace) => workspace.id, {
    onDelete: 'CASCADE',
  })
  workspaceId: string;

  @PrimaryColumn('uuid')
  @JoinColumn({ name: 'journeyId' })
  @ManyToOne(() => Journey, (journey) => journey.id, { onDelete: 'CASCADE' })
  public journeyId: string;

  @Column({ type: 'jsonb' })
  public devModeState!: DevModeState;
}
