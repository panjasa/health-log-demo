import { MongoClient, Db } from 'mongodb';
import { config } from './config';

// One client per process, reused across requests (connection pooling).
// maxPoolSize stays small: many Cloud Run instances x pool must fit the
// connection limit of the Atlas tier.
const client = new MongoClient(config.mongoUri, {
  maxPoolSize: Number(process.env.MONGO_POOL || 10),
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
});

let db: Db | undefined;

export async function getDb(): Promise<Db> {
  if (!db) {
    await client.connect();
    db = client.db(config.mongoDb);
    await db.collection('readings').createIndex({ userId: 1, type: 1, takenAt: -1 });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
  }
  return db;
}

export async function pingMongo(): Promise<boolean> {
  try {
    const d = await getDb();
    await d.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
