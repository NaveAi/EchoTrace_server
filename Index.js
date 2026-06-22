const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// תיקיית אחסון זמנית לחלוטין (עד להורדה)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// --- מצב בזיכרון (RAM) של השרת ---
// connections: Map דו-כיוונית code -> partnerCode. תומך בכמה זוגות בו-זמנית,
// כל זוג מקבל שתי כניסות (אחת לכל כיוון) ואינו משפיע על זוגות אחרים.
const connections = {};

// pairsList: רשימה שטוחה של כל הזיווגים שנוצרו, לצורכי נראות/דיבוג.
// לא קריטית ללוגיקה - connections הוא מקור האמת היחיד לניתוב.
const pairsList = [];

// חשוב: שימוש ב-memoryStorage כדי שהקובץ יישמר בפועל רק בתוך ה-route handler,
// אחרי ש-req.body מאוכלס לחלוטין. ב-diskStorage הקודם, פונקציית filename()
// רצה לפני שה-body התמלא (תלוי בסדר השדות ב-FormData), וכל ההעלאות
// נפלו לשם הקובץ הקבוע "unknown.jpg" והתנגשו אחת בשנייה.
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/upload', upload.single('image'), (req, res) => {
    console.log("Received upload request for code:", req.body.myCode); // <--- הוסף את זה
    console.log("File exists:", !!req.file); // <--- הוסף את זה
    // ...
});
app.get('/', (req, res) => {
    res.send('EchoTrace Server 2.0 - Active & Secured. 🚀');
});

// 1. נתיב זיווג - תומך בכמה זוגות נפרדים בו-זמנית
app.post('/api/pair', (req, res) => {
    const { myCode, partnerCode } = req.body;

    if (!myCode || !partnerCode) {
        return res.status(400).json({ success: false, error: 'Missing codes' });
    }
    if (myCode === partnerCode) {
        return res.status(400).json({ success: false, error: 'Cannot pair with yourself' });
    }

    connections[myCode] = partnerCode;
    connections[partnerCode] = myCode;

    pairsList.push({
        codeA: myCode,
        codeB: partnerCode,
        createdAt: new Date().toISOString(),
    });

    console.log(`Pair created: ${myCode} <--> ${partnerCode} (total pairs in memory: ${pairsList.length})`);
    res.json({ success: true, message: 'Connected' });
});

// 2. נתיב העלאת תמונה
app.post('/api/upload', upload.single('image'), (req, res) => {
    const { myCode } = req.body;

    if (!myCode) {
        return res.status(400).json({ success: false, error: 'Missing myCode' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image' });
    }

    // כאן req.body כבר מאוכלס לגמרי - הקובץ עצמו עדיין רק בזיכרון (req.file.buffer)
    const destPath = path.join(uploadDir, `${myCode}.jpg`);
    fs.writeFileSync(destPath, req.file.buffer);

    console.log(`Image uploaded from ${myCode} -> ${destPath}`);
    res.json({ success: true });
});

// 3. נתיב הורדה ומחיקה מיידית (השותף מושך ומוחק מהשרת לנצח)
app.get('/api/download/:myCode', (req, res) => {
    const myCode = req.params.myCode;
    const partnerCode = connections[myCode];

    if (!partnerCode) {
        return res.status(404).json({ error: 'No partner connected' });
    }

    const partnerImagePath = path.join(uploadDir, `${partnerCode}.jpg`);

    if (fs.existsSync(partnerImagePath)) {
        res.sendFile(partnerImagePath, (err) => {
            if (!err) {
                try {
                    fs.unlinkSync(partnerImagePath);
                    console.log(`Image ${partnerCode}.jpg deleted from server after download.`);
                } catch (unlinkErr) {
                    console.error('Failed to delete image:', unlinkErr);
                }
            }
        });
    } else {
        res.status(404).json({ error: 'No new image available' });
    }
});

// 4. בדיקת סטטוס חיבור לשותף
app.get('/api/partner-status/:myCode', (req, res) => {
    const myCode = req.params.myCode;
    const partnerCode = connections[myCode];
    res.json({ connected: !!partnerCode });
});

// 5. דיבוג: כל הזוגות הפעילים כרגע בזיכרון השרת
app.get('/api/connections', (req, res) => {
    res.json({
        activePairsCount: pairsList.length,
        pairs: pairsList,
    });
});

app.listen(PORT, () => {
    console.log(`EchoTrace Server running on port ${PORT}`);
});
