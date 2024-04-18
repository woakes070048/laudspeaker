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

const dumpData = async (
  client: ReturnType<typeof createClient>,
  target: string
) => {
  const dump = {};

  const { keys } = await client.scan(0, { MATCH: '*' });

  for (const key of keys) {
    const type = await client.type(key);

    if (type === 'string') {
      const value = await client.get(key);

      dump[key] = value;
    } else if (type === 'hash') {
      const object = await client.hGetAll(key);

      if (object.data) {
        object.data = JSON.parse(object.data);

        recursivelyDeleteKeysFromObject(object, KEYS_TO_DELETE_FROM_DATA);

        object.data = JSON.stringify(object.data);
      }

      dump[key] = object;
    }
  }

  fs.writeFileSync(target, JSON.stringify(dump, null, 2));
  console.log(`Data dumped successfully to ${target}`);
};
const uploadData = async (
  client: ReturnType<typeof createClient>,
  target: string
) => {
  const dump = JSON.parse(fs.readFileSync(target).toString());

  for (const [key, value] of Object.entries(dump)) {
    if (typeof value === 'object') {
      await client.hSet(key, value as any);
    } else {
      await client.set(key, value as any);
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
