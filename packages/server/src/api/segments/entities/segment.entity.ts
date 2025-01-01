import { Account } from '../../accounts/entities/accounts.entity';
import {
  BaseEntity,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Workspaces } from '../../workspaces/entities/workspaces.entity';

export enum SegmentType {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
  SYSTEM = 'system',
}

@Entity()
export class Segment extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  public id: string;

  @JoinColumn({name: "workspace_id"})
  @ManyToOne(() => Workspaces, (workspace) => workspace.id, {
    onDelete: 'CASCADE',
  })
  workspace: Workspaces;

  @Column()
  public name: string;

  @Column({ nullable: true })
  public description: string;

  @Column({ enum: SegmentType })
  public type: SegmentType;

  @Column('jsonb', { default: { conditionalType: 'and', conditions: [] } })
  public inclusionCriteria: any;

  @Column({ default: true })
  public isFreezed: boolean;

  @Column({ default: false })
  public isUpdating: boolean;

  @Column('jsonb', {
    default: {
      conditions: {
        id: 'conditions',
        type: 'select',
        label: 'filter on',
        options: [
          {
            label: 'select',
            id: '',
            isPlaceholder: true,
          },
          {
            label: 'Attributes',
            id: 'attributes',
          },
        ],
      },
    },
  })
  public resources: any;

  @Column('uuid', { name: 'workspace_id', nullable: false })
  workspace_id: string;
}
