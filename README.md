# Shos - One Product Store

הפרויקט נבנה מחדש כ"חנות מוצר אחד בעמוד אחד":

- `client/` — דף נחיתה יחיד עם טופס הזמנה קצר.
- `server/` — API פשוט לשליפת המוצר ולשמירת הזמנה.
- `server/db/schema.sql` — סכימה חדשה ופשוטה של `products` ו-`orders`.

## הפעלה

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

## API עיקרי

- `GET /api/product` — מחזיר את המוצר הפעיל היחיד.
- `POST /api/orders` — יוצר הזמנה חדשה (שם, טלפון, כמות).
