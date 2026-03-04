# Shos - One Product Store

הפרויקט נבנה מחדש כ"חנות מוצר אחד בעמוד אחד":

- `client/` — דף נחיתה יחיד עם טופס הזמנה קצר.
- `server/` — API פשוט לשליפת המוצר ולשמירת הזמנה.
- `server/db/schema.sql` — מבנה המסד החדש שמתעדכן בכל עליית שרת.

## הפעלה

```bash
cd server
npm install
export DATABASE_URL=postgres://user:password@localhost:5432/shos
npm run dev
```

> בכל הפעלה מחדש של השרת, הסכימה הקיימת נמחקת ונבנית מחדש מתוך `server/db/schema.sql`.

בטרמינל נוסף:

```bash
cd client
npm install
npm run dev
```

## API עיקרי

- `GET /api/product` — מחזיר את המוצר הפעיל היחיד.
- `POST /api/orders` — יוצר הזמנה חדשה (שם, טלפון, כמות).


## ניהול מוצר

- דף הניהול זמין בכתובת `http://localhost:5173/admin` (ללא קישור גלוי מדף הבית).
- ניתן לעדכן פרטי מוצר ולהעלות תמונה מקומית (התמונה נשמרת כ-Data URL בשדה `image_url`).
