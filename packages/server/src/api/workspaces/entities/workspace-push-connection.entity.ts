import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Workspaces } from './workspaces.entity';
import { PushPlatforms } from '../../templates/entities/template.entity';
import { PushFirebasePlatforms } from '../../accounts/entities/accounts.entity';

@Entity()
export class WorkspacePushConnection {
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

  @Column({
    type: 'jsonb',
    default: {
      [PushPlatforms.IOS]: undefined,
      [PushPlatforms.ANDROID]: undefined,
    },
  })
  pushPlatforms: PushFirebasePlatforms;

  @Column()
  workspaceId: string;
}
