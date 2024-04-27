import { createClient } from 'redis';
import fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

enum Action {
  DUMP = 'dump',
  UPLOAD = 'upload',
}

const KEYS_TO_DELETE_FROM_DATA = ['customer', 'customerId'];

const recursivelyDeleteKeysFromObject = (
  object: object,
  keysToDelete: string[]
) => {
  for (const key of Object.keys(object)) {
    if (KEYS_TO_DELETE_FROM_DATA.includes(key)) {
      delete object[key];
      continue;
    }

    if (typeof object[key] === 'object' && object[key] !== null) {
      recursivelyDeleteKeysFromObject(object[key], keysToDelete);
    }
  }
};

const dumpString = (key: string, client: ReturnType<typeof createClient>) => {
  return client.get(key);
};

const dumpHash = async (
  key: string,
  client: ReturnType<typeof createClient>
) => {
  const object = await client.hGetAll(key);

  if (object.data) {
    object.data = JSON.parse(object.data);

    recursivelyDeleteKeysFromObject(object, KEYS_TO_DELETE_FROM_DATA);

    object.data = JSON.stringify(object.data);
  }

  return object;
};

const dumpList = (key: string, client: ReturnType<typeof createClient>) => {
  return client.lRange(key, 0, -1);
};

const dumpZSet = (key: string, client: ReturnType<typeof createClient>) => {
  return client.zRangeWithScores(key, 0, -1);
};

const dumpStream = (key: string, client: ReturnType<typeof createClient>) => {
  return client.xRange(key, '-', '+');
};

const dumpData = async (
  client: ReturnType<typeof createClient>,
  target: string
) => {
  const dump = {};

  let cursor = 0;

  do {
    const res = await client.scan(cursor, { MATCH: '*' });
    cursor = res.cursor;

    for (const key of res.keys) {
      const type = await client.type(key);

      dump[key] = { type };

      switch (type) {
        case 'string':
          dump[key].value = await dumpString(key, client);
          break;
        case 'hash':
          dump[key].value = await dumpHash(key, client);
          break;
        case 'list':
          dump[key].value = await dumpList(key, client);
          break;
        case 'zset':
          dump[key].value = await dumpZSet(key, client);
          break;
        case 'stream':
          dump[key].value = await dumpStream(key, client);
          break;
        default:
          break;
      }
    }
  } while (cursor !== 0);

  fs.writeFileSync(target, JSON.stringify(dump, null, 2));
  console.log(`Data dumped successfully to ${target}`);
};

const uploadString = async (
  key: string,
  value: any,
  client: ReturnType<typeof createClient>
) => {
  await client.set(key, value);
};

const uploadHash = async (
  key: string,
  value: any,
  client: ReturnType<typeof createClient>
) => {
  await client.hSet(key, value);
};

const uploadList = async (
  key: string,
  value: any,
  client: ReturnType<typeof createClient>
) => {
  await client.rPush(key, value);
};

const uploadZSet = async (
  key: string,
  value: any,
  client: ReturnType<typeof createClient>
) => {
  await client.zAdd(key, value);
};

const uploadStream = async (
  key: string,
  value: any,
  client: ReturnType<typeof createClient>
) => {
  for (const { id, message } of value) {
    await client.xAdd(key, id, message);
  }
};

const uploadData = async (
  client: ReturnType<typeof createClient>,
  target: string
) => {
  const dump = JSON.parse(fs.readFileSync(target).toString());

  for (const [key, data] of Object.entries(dump)) {
    const { type, value } = data as { type: string; value: unknown };

    switch (type) {
      case 'string':
        await uploadString(key, value, client);
        break;
      case 'hash':
        await uploadHash(key, value, client);
        break;
      case 'list':
        await uploadList(key, value, client);
        break;
      case 'zset':
        await uploadZSet(key, value, client);
        break;
      case 'stream':
        await uploadStream(key, value, client);
        break;
      default:
        break;
    }
  }

  console.log(`Data uploaded successfully to Redis`);
};

const main = async () => {
  const action = process.argv[2];
  const target = process.argv[3];

  if (!Object.values(Action).includes(action as Action)) {
    throw new Error(`Action should be one of ${Object.values(Action)}`);
  }
  if (!target) throw new Error(`Target should be defined`);

  const client = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  });

  client.on('error', async (err) => {
    await client.quit();
    throw new Error(err);
  });

  await client.connect();

  switch (action) {
    case Action.DUMP:
      await dumpData(client, target);
      break;
    case Action.UPLOAD:
      await uploadData(client, target);
      break;
  }

  await client.quit();
};

main();
