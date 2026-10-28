import type { Config } from '@netlify/functions';
import { remindStaleEmailInvites } from '../../server/emailInvites';

// Replaces the hourly setInterval sweeper used by the long-running server:
// reminds owners/invitees about email invites still pending after 3 days.
export default async () => {
  const count = await remindStaleEmailInvites();
  console.log(`[email-invites] reminder sweep processed ${count} invite(s)`);
};

export const config: Config = {
  schedule: '@hourly',
};
