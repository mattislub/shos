# Shos

סקיצה התחלתית לאתר מכירה עם React ושרת Node, כולל סקריפט לאתחול מסד הנתונים.

## איך מריצים

```bash
cd server
npm install
export DATABASE_URL=postgres://user:password@localhost:5432/shos
npm run db:init
npm run dev
```

בטרמינל נוסף:

```bash
cd client
npm install
npm run dev
```

## מבנה

- `server/` Express API + PostgreSQL.
- `client/` אפליקציית React (Vite).
- `server/db/init.js` מאתחל את סכמת ה-DB ומזריע נתונים ראשוניים.
