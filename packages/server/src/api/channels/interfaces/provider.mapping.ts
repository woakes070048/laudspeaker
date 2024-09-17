import { MailgunProvider } from "../email/providers/mailgun.provider";
import { ResendProvider } from "../email/providers/resend.provider";

export const providerMapping = {
  mailgun: MailgunProvider,
  resend: ResendProvider,
};
