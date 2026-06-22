
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
app.use(express.json());

// Middleware ללוגים כלליים לכל בקשה שמגיעה
app.use((req, res, next) => {
    console.log(`[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const connections = {};
const pairsList = [];
const tokens = {}; // map myCode -> fcm token
const fcmKey = process.env.FCM_SERVER_KEY || '';

// הגדרת Multer בזיכרון
const upload = multer({ storage: multer.memoryStorage() });

function sendFcm(toToken, data) {
    if (!fcmKey) {
        console.warn('FCM_SERVER_KEY not configured; skipping push');
        return;
    }

    const payload = JSON.stringify({ to: toToken, data: data, priority: 'high' });
    const options = {
        hostname: 'fcm.googleapis.com',
        path: '/fcm/send',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'key=' + fcmKey,
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => console.log(`FCM send result: ${res.statusCode} - ${body}`));
    });

    req.on('error', (err) => {
        console.error('FCM send error:', err);
    });

    req.write(payload);
    req.end();
}

// Endpoint for clients to register their FCM token
app.post('/api/register', (req, res) => {
    const { myCode, fcmToken } = req.body;
    console.log('/api/register called with', req.body);
    if (!myCode || !fcmToken) return res.status(400).json({ success: false, error: 'Missing myCode or fcmToken' });
    tokens[myCode] = fcmToken;
    console.log(`Registered token for ${myCode}: ${fcmToken}`);
    res.json({ success: true });
});

// --- נתיב העלאת תמונה ---
app.post('/api/upload', upload.single('image'), (req, res) => {
    console.log("--- START UPLOAD LOG ---");
    console.log("Body:", req.body); // בדיקה אם myCode מגיע
    console.log("File exists:", !!req.file); // בדיקה אם התמונה מגיעה
    
    if (req.file) {
        console.log("File name:", req.file.originalname);
        console.log("File size:", req.file.size);
    }

    const { myCode } = req.body;

    if (!myCode) {
        console.error("Upload failed: Missing myCode");
        return res.status(400).json({ success: false, error: 'Missing myCode' });
    }
    if (!req.file) {
        console.error("Upload failed: No image file received");
        return res.status(400).json({ success: false, error: 'No image' });
    }

    const destPath = path.join(uploadDir, `${myCode}.jpg`);
    try {
        fs.writeFileSync(destPath, req.file.buffer);
        console.log(`SUCCESS: Image saved to ${destPath}`);

        // Try to notify partner via FCM (if paired and partner token registered)
        const partner = connections[myCode];
        if (partner) {
            const partnerToken = tokens[partner];
            if (partnerToken) {
                console.log(`Sending FCM to partner ${partner} (token=${partnerToken}) for traceId=${myCode}`);
                sendFcm(partnerToken, { type: 'NEW_TRACE', traceId: myCode, caption: req.body.caption || '' });
            } else {
                console.log(`No FCM token registered for partner ${partner}; skipping push`);
            }
        } else {
            console.log(`No partner connected for ${myCode}; will not push`);
        }

        // Respond with traceId so clients can use it if needed
        return res.json({ success: true, traceId: myCode });
    } catch (err) {
        console.error("File save error:", err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        console.log("--- END UPLOAD LOG ---");
    }
});

// --- נתיב זיווג ---
app.post('/api/pair', (req, res) => {
    console.log("Pair request body:", req.body);
    const { myCode, partnerCode } = req.body;

    if (!myCode || !partnerCode) {
        return res.status(400).json({ success: false, error: 'Missing codes' });
    }

    connections[myCode] = partnerCode;
    connections[partnerCode] = myCode;

    pairsList.push({ codeA: myCode, codeB: partnerCode, createdAt: new Date().toISOString() });
    console.log(`Pair created: ${myCode} <--> ${partnerCode}`);
    res.json({ success: true, message: 'Connected' });
});

// --- נתיב הורדה ישיר שנמצא כבר בקוד הלקוח ---
app.get('/api/download/:myCode', (req, res) => {
    const myCode = req.params.myCode;
    const partnerCode = connections[myCode];
    console.log(`Download request for partner of ${myCode} (Partner is: ${partnerCode})`);

    if (!partnerCode) return res.status(404).json({ error: 'No partner' });

    const partnerImagePath = path.join(uploadDir, `${partnerCode}.jpg`);
    if (fs.existsSync(partnerImagePath)) {
        res.sendFile(partnerImagePath, (err) => {
            if (!err) fs.unlinkSync(partnerImagePath);
        });
    } else {
        res.status(404).json({ error: 'No image found' });
    }
});

// --- נתיב מבוקש על ידי הלקוח: /downloadImage?traceId= ---
// הלקוח מצפה לקבל JSON עם שדה "downloadUrl" שמצביע לנתיב ממנו ניתן להוריד את התמונה
app.get('/downloadImage', (req, res) => {
    const traceId = req.query.traceId;
    console.log(`/downloadImage called with traceId=${traceId}`);
    if (!traceId) return res.status(400).json({ error: 'Missing traceId' });

    // בנייה של URL מלא להורדה (מכוון ל-API חדש /api/raw/:traceId שמחזיר את הקובץ של ה-uploader)
    const host = req.get('host');
    const protocol = req.protocol;
    const downloadUrl = `${protocol}://${host}/api/raw/${traceId}`;

    return res.json({ downloadUrl });
});

// --- נתיב שמשרת ישירות את קובץ התמונה שהועלה עבור traceId (writer's myCode)
app.get('/api/raw/:traceId', (req, res) => {
    const traceId = req.params.traceId;
    const filePath = path.join(uploadDir, `${traceId}.jpg`);
    console.log(`/api/raw called for traceId=${traceId}, path=${filePath}`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath, (err) => {
            if (!err) {
                // מחק את הקובץ לאחר הורדה כדי למנוע הורדות חוזרות
                try { fs.unlinkSync(filePath); } catch (e) { console.error('Failed to unlink after send:', e); }
            }
        });
    } else {
        res.status(404).json({ error: 'No image found' });
    }
});

// --- נתיב שאישור הורדה ---
app.post('/confirmDownload', (req, res) => {
    const { traceId } = req.body;
    console.log(`/confirmDownload called for traceId=${traceId}`);
    // כרגע אין לוגיקה מיוחדת - פשוט מוחזר OK
    return res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`EchoTrace Server running on port ${PORT}`);
});
