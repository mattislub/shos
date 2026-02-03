# Shos

Initial sketch for a sales site with React and a Node server, including a database bootstrap script.

## How to run

```bash
cd server
npm install
export DATABASE_URL=postgres://user:password@localhost:5432/shos
npm run db:init
npm run dev
```

In another terminal:

```bash
cd client
npm install
npm run dev
```

## Structure

- `server/` Express API + PostgreSQL.
- `client/` React app (Vite).
- `server/db/init.js` initializes the DB schema and seeds starter data.
