const express = require('express');
const admin = require('firebase-admin');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});

// אתחול Firebase
let db;
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.STORAGE_BUCKET || 'echotrace.appspot.com'
    });
    db = admin.firestore(); // שימוש ב-Firestore לניהול הזיווגים
    console.log("Firebase & Firestore initialized successfully!");
} catch (error) {
    console.error("Firebase init error:", error.message);
}

// נתיב בדיקה
app.get('/', (req, res) => {
    res.send('EchoTrace Server is Live! 🚀');
});

// 🔗 נתיב זיווג אמיתי בין שני משתמשים
app.post('/api/pair', async (req, res) => {
    const { myCode, partnerCode } = req.body;

    if (!myCode || !partnerCode) {
        return res.status(400).json({ success: false, error: 'Missing codes' });
    }

    try {
        // שמירת קשר דו-כיווני ב-Database
        const pairRef = db.collection('pairs').doc(myCode);
        await pairRef.set({
            partner: partnerCode,
            connectedAt: new Date().toISOString()
        });

        // יצירת הקשר גם אצל השותף כדי שיהיה סנכרון מלא
        const partnerRef = db.collection('pairs').doc(partnerCode);
        await partnerRef.set({
            partner: myCode,
            connectedAt: new Date().toISOString()
        });

        console.log(`Successfully paired: ${myCode} <--> ${partnerCode}`);
        res.json({ success: true, message: 'Pairing successful' });
    } catch (error) {
        console.error("Pairing failed:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});
