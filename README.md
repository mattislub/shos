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
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=admin123
# SMTP (Hostinger example)
export SMTP_HOST=smtp.hostinger.com
export SMTP_PORT=465
export SMTP_SECURE=true
export SMTP_USER=you@example.com
export SMTP_PASS=your_smtp_password
export SMTP_FROM=you@example.com
export SMTP_TO_ORDER_NOTIFICATIONS=you@example.com
npm run dev
```

> בכל הפעלה מחדש של השרת, הסכימה הקיימת נמחקת ונבנית מחדש מתוך `server/db/schema.sql`.

בטרמינל נוסף:

```bash
cd client
npm install
npm run dev
```

## מיילים להזמנות

כאשר מוגדרים משתני SMTP, כל הזמנה חדשה (`POST /api/orders`) שולחת מייל התראה אוטומטי לבעל החנות לכתובת שמוגדרת ב-`SMTP_TO_ORDER_NOTIFICATIONS`.

בנוסף, אם הבקשה כוללת `customer_email`, המערכת שולחת גם מייל אישור ללקוח.

שדות נדרשים להפעלת המייל:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE` (`true` עבור פורט 465)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_TO_ORDER_NOTIFICATIONS`

אם אחד השדות חסר, ההזמנה עדיין תישמר במסד והשרת ידלג על שליחת המייל.

## API עיקרי

- `GET /api/product` — מחזיר את המוצר הפעיל היחיד כולל מערך תמונות `images`.
- `POST /api/orders` — יוצר הזמנה חדשה (שם, טלפון, כמות, ו-`customer_email` אופציונלי למייל אישור ללקוח).
- `PUT /api/admin/product` — עדכון מוצר פעיל והעלאת תמונות מקבצים מקומיים (נשמרות פיזית בשרת תחת `/uploads`).

## ניהול מוצר

- דף הניהול זמין בכתובת `http://localhost:5173/admin` (ללא קישור גלוי מדף הבית).
- העלאת תמונות נעשית בקבצים מקומיים (לא קישורים), וניתן להעלות כמה תמונות לכל מוצר.


## אבטחת ניהול

- כל נתיבי הניהול (`/api/admin/*`) דורשים Basic Auth.
- ברירת מחדל: `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=admin123` (מומלץ לשנות בפרודקשן).
- כניסה לניהול נעשית דרך מסך התחברות ב-`/admin` והדפדפן שומר את הטוקן ב-sessionStorage.
