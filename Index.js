const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`EchoTrace Server running on port ${PORT}`);
});

// תיקיית אחסון זמנית לחלוטין (עד להורדה)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// זיכרון זמני לקשרים (Connections) - נשמר מקומית על השרת
const connections = {}; 

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        // שם הקובץ יהיה מזהה המכשיר של השולח
        const myCode = req.body.myCode || 'unknown';
        cb(null, `${myCode}.jpg`);
    }
});
const upload = multer({ storage: storage });

app.get('/', (req, res) => {
    res.send('EchoTrace Server 2.0 - Zero Interface. Total Presence. 🚀');
});

// 4.1.5: POST /api/pair - יצירת קשר דו-כיווני בלתי ניתן לניתוק (אלא ע"י מחיקת אפליקציה)
app.post('/api/pair', (req, res) => {
    const { myCode, partnerCode } = req.body;
    if (!myCode || !partnerCode) {
        return res.status(400).json({ success: false, error: 'Missing codes' });
    }

    // יצירת קשר הדדי קבוע בזיכרון השרת
    connections[myCode] = partnerCode;
    connections[partnerCode] = myCode;

    console.log(`Pair created: ${myCode} <--> ${partnerCode}`);
    res.json({ success: true, message: 'Connected' });
