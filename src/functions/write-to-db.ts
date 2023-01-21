import { Client } from '@notionhq/client';
import * as chrono from 'chrono-node';
import { Context, Event, Callback } from '../types/twilio';

const DATABASE_ID = '6180f425330a4251bc3b0634a2e75926';

type Thought = {
  name: string;
  tags?: Array<string>
  status?: string;
  dueDate?: string;
};

const tagRegex = /#([^ ]+)/g;
const statusRegex = />([^ ]+)/;
const extraSpaceRegex = /  +/g;

function toLocalISO(date: Date) {
  const offset = date.getTimezoneOffset() * 60000; //offset in milliseconds
  const localISOTime = (new Date(date.valueOf() - offset)).toISOString().slice(0, -1);

  return localISOTime;
}

function timeFrom(iso: string) {
  return iso.split('T')[1].split('.')[0];
}

function thoughtParser(message: string): Thought {
  // due date
  const parsedDate = chrono.parse(message);
  let dueDate;
  if (parsedDate.length > 0) {
    const fullDate = toLocalISO(parsedDate[0].date());
    const sameTime = timeFrom(fullDate) === timeFrom(toLocalISO(new Date()));
    
    dueDate = sameTime ? fullDate.split('T')[0] : fullDate;
    message = message.replace(parsedDate[0].text, '');
  }

  // tags
  const tagsTemp = Array.from(message.matchAll(tagRegex)).map(([, tag]) => tag);
  const tags = tagsTemp.length > 0 ? tagsTemp : undefined;
  message = message.replace(tagRegex, '');

  // status
  const status = message.match(statusRegex)?.[1];
  message = message.replace(statusRegex, '');

  // name
  const name = message.trim().replace(extraSpaceRegex, ' ');

  return {
    name,
    tags,
    status,
    dueDate,
  };
}

export const handler = async function (_: Context, event: Event, callback: Callback) {
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const twiml = new Twilio.twiml.MessagingResponse();
  const textMessage = event.Body?.trim();

  if (!textMessage) {
    return callback('No message sent');
  }

  const thought = thoughtParser(textMessage);

  try {
    await notion.pages.create({
      parent: {
        database_id: DATABASE_ID
      },
      properties: {
        ...(thought.name && { 'Name': { title: [{ text: { content: thought.name } }] } }),
        ...(thought.tags && { 'Tags': { multi_select: thought.tags.map((tag) => ({ name: tag })) } }),
        ...(thought.status && { 'Status': { select: { name: thought.status } } }),
        ...(thought.dueDate && { 'Deadline': { date: { 
          start: thought.dueDate, 
          ...(thought.dueDate.includes('T') && { time_zone: 'US/Mountain' }),
        } } }),
      }
    });

    callback(null, twiml);
  } catch (err) {
    const error = err as Error;
    twiml.message(`Error: ${error.message}`);
    console.error(error);

    callback(null, twiml);
  }
};