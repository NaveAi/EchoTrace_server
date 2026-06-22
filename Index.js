const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// הגדרת Multer בזיכרון
const upload = multer({ storage: multer.memoryStorage() });

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
        res.json({ success: true });
    } catch (err) {
        console.error("File save error:", err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
    console.log("--- END UPLOAD LOG ---");
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

// --- נתיב הורדה ---
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

app.listen(PORT, () => {
    console.log(`EchoTrace Server running on port ${PORT}`);
});
