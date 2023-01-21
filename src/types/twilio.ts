import { Context as TContext, ServerlessCallback } from '@twilio-labs/serverless-runtime-types/types';

export type Context = TContext<{ NOTION_API_KEY: string; }>
export type Callback = ServerlessCallback;
export type Event = { Body?: string }
