// Generates access tokens for load testing, signed with the same JWT_SECRET
// as the API. Usage: JWT_SECRET=... node scripts/make-tokens.mjs 200 > ../loadtest/tokens.json
// Never commit the output.
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'dev-only-change-me';
const n = Number(process.argv[2] || 100);
const tokens = Array.from({ length: n }, (_, i) =>
  jwt.sign({ sub: `load:user${i}`, email: `user${i}@load.test`, typ: 'access' }, secret, { expiresIn: '4h' }),
);
console.log(JSON.stringify(tokens));
