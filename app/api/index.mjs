import { createApp } from '../server/app.mjs';

let ready;
export default async function handler(req, res) {
  ready ||= createApp({ production: true, seedData: false });
  const { app } = await ready;
  return app(req, res);
}
