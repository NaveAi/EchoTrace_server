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

// זיכרון זמני לקשרים (Connections) - נשמר בזיכרון השרת
const connections = {}; 

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        const myCode = req.body.myCode || 'unknown';
        cb(null, `${myCode}.jpg`);
    }
});
const upload = multer({ storage: storage });

app.get('/', (req, res) => {
    res.send('EchoTrace Server 2.0 - Active & Secured. 🚀');
});

// 1. נתיב זיווג דרך האפליקציה
app.post('/api/pair', (req, res) => {
    const { myCode, partnerCode } = req.body;
    if (!myCode || !partnerCode) {
        return res.status(400).json({ success: false, error: 'Missing codes' });
    }
    connections[myCode] = partnerCode;
    connections[partnerCode] = myCode;
    console.log(`Pair created: ${myCode} <--> ${partnerCode}`);
    res.json({ success: true, message: 'Connected' });
});

// 2. נתיב העלאת תמונה (מחק את הקודמת אם הייתה ועוד לא הורדה)
app.post('/api/upload', upload.single('image'), (req, res) => {
    const { myCode } = req.body;
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image' });
    }
    console.log(`Image uploaded from ${myCode}`);
    res.json({ success: true });
});

// 3. נתיב הורדה ומחיקה מיידית (השותף מושך ומוחק מהענן לנצח)
app.get('/api/download/:myCode', (req, res) => {
    const myCode = req.params.myCode;
    const partnerCode = connections[myCode];

    if (!partnerCode) {
        return res.status(404).json({ error: 'No partner connected' });
    }

    const partnerImagePath = path.join(uploadDir, `${partnerCode}.jpg`);

    if (fs.existsSync(partnerImagePath)) {
        // שולחים את הקובץ למכשיר
        res.sendFile(partnerImagePath, (err) => {
            if (!err) {
                // מחיקה פיזית מהשרת מיד לאחר הצלחת המשלוח!
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
