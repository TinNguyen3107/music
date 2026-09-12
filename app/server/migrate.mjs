// Run deliberately, once per Vercel environment. The application never mutates schema at request time.
import { createDatabase } from './database.mjs';
const { db } = await createDatabase({ production: true, migrate: true });
await db.close();
console.log('Melodik database migration completed.');
