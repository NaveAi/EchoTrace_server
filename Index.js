const express = require('express');
const admin = require('firebase-admin');
const app = express();

// תמיכה בקבלת מידע בפורמט JSON מהאפליקציה
app.use(express.json());

// 1. הפעלת האזנה לפורט באופן מיידי כדי ש-Render לא יסגור את האפליקציה
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});

// 2. אתחול מוגן של Firebase
try {
    const serviceAccount = require('./serviceAccountKey.json');
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // שימוש בשם הפרויקט שלך עם הסיומת הרשמית של גוגל
        storageBucket: process.env.STORAGE_BUCKET || 'echotrace.appspot.com'
    });
    
    console.log("Firebase initialized successfully!");
} catch (error) {
    console.error("אזהרה: קובץ המפתח (serviceAccountKey.json) חסר או פגום.");
    console.error("השרת נשאר פתוח, אך פניות ל-Firebase ייכשלו: ", error.message);
}

// 3. נתיבי ה-API של האפליקציה (Routes)

// נתיב בדיקה כללי - כדי לראות שהשרת חי בדפדפן
app.get('/', (req, res) => {
    res.send('EchoTrace Server is Live and Protected! 🚀');
});

// נתיב זיווג ראשוני (כשהאפליקציה תרצה לרשום מכשיר חדש בשרת)
app.post('/api/pair', (req, res) => {
    const { deviceId } = req.body;
    console.log(`בקשת זיווג התקבלה עבור קוד: ${deviceId}`);
    
    if (!deviceId) {
        return res.status(400).json({ error: 'Missing deviceId' });
    }
    
    // כאן בעתיד נשמור את הקוד במסד הנתונים
    res.json({ status: 'success', message: 'Device registered on server' });
});

// נתיב העלאת תמונה לווידג'ט
app.post('/api/upload', (req, res) => {
    // נתיב זה ישמש אותנו בהמשך להעברת תמונות בין בני הזוג
    res.json({ status: 'pending', message: 'Image upload endpoint is ready' });
});
