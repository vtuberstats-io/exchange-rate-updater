const CURRENCYLAYER_ACCESS_KEY = process.env.CURRENCYLAYER_ACCESS_KEY;
const MONGODB_URL = process.env.MONGODB_URL;
const HOSTNAME = process.env.HOSTNAME; // offered by kubernetes automatically

if (!CURRENCYLAYER_ACCESS_KEY || !MONGODB_URL || !HOSTNAME) {
  console.error(`missing environment variables, env: ${JSON.stringify(process.env)}`);
  process.exit(1);
}

const { addExitHook } = require('exit-hook-plus');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const mongo = new MongoClient(MONGODB_URL, { useUnifiedTopology: true });

async function init() {
  console.info('connecting to mongodb');
  await mongo.connect();
  const dbCollection = mongo.db('vtuberstats').collection('usd-exchange-rate');
  addExitHook(async () => await mongo.close());

  console.info('fetching latest exchange rate from currencylayer');
  const apiUrl = `http://api.currencylayer.com/live?access_key=${CURRENCYLAYER_ACCESS_KEY}&base=USD`;
  const data = (await axios.get(apiUrl)).data;
  const now = new Date();
  const converted = Object.entries(data.quotes).map(([key, value]) => ({
    lastUpdatedAt: now.toISOString(),
    type: key.substring(3),
    exchangeRateUsd: value
  }));

  console.info(`got ${converted.length} items, now updating mongodb collection`);
  const operations = converted.map((item) => ({
    updateOne: {
      filter: { type: item.type },
      update: {
        $set: item
      },
      upsert: true
    }
  }));
  const result = await dbCollection.bulkWrite(operations);
  console.info(
    `updated ${result.modifiedCount} and inserted ${result.insertedCount} documents, bye`
  );
}

init();
