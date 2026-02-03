# Shos

סקיצה התחלתית לאתר מכירה עם React ושרת Node, כולל סקריפט לאתחול מסד הנתונים.

## איך מריצים

```bash
cd server
npm install
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

- `server/` Express API + SQLite.
- `client/` אפליקציית React (Vite).
- `server/db/init.js` מאתחל את סכמת ה-DB ומזריע נתונים ראשוניים.
