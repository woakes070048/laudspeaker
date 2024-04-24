import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EventDocument = Event & Document;

@Schema({ strict: false })
export class Event {
  @Prop({ index: true })
  workspaceId: string;

  @Prop({ index: true })
  event: string;

  @Prop({ index: true })
  correlationKey: string;

  @Prop({ index: true })
  correlationValue: string;

  @Prop({ type: Object })
  payload: Record<string, unknown>;
}

export const EventSchema = SchemaFactory.createForClass(Event);
