import { IsNotEmpty, IsOptional, IsObject, IsString } from 'class-validator';
import { WebhookData } from '../entities/template.entity';

export class TestWebhookDto {
  @IsOptional()
  @IsString()
  testCustomerEmail: string;

  @IsNotEmpty()
  @IsObject()
  public webhookData: WebhookData;
}
