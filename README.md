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

- `GET /api/product` — מחזיר את המוצר הפעיל היחיד כולל מערך תמונות `images`.
- `POST /api/orders` — יוצר הזמנה חדשה (שם, טלפון, כמות).
- `PUT /api/admin/product` — עדכון מוצר פעיל והעלאת תמונות מקבצים מקומיים (נשמרות פיזית בשרת תחת `/uploads`).

## ניהול מוצר

- דף הניהול זמין בכתובת `http://localhost:5173/admin` (ללא קישור גלוי מדף הבית).
- העלאת תמונות נעשית בקבצים מקומיים (לא קישורים), וניתן להעלות כמה תמונות לכל מוצר.
