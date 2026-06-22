const express = require('express');
const app = express();

app.use(express.json());

// פורט ההאזנה של Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});

// משתנה מקומי שישמור את הזיווגים בזיכרון השרת (בחינם ובלי הגדרות!)
const localPairs = {};

// נתיב בדיקה כללי
app.get('/', (req, res) => {
    res.send('EchoTrace Server is Live and Free! 🚀');
});

// 🔗 נתיב זיווג בזיכרון המקומי
app.post('/api/pair', (req, res) => {
    const { myCode, partnerCode } = req.body;

    if (!myCode || !partnerCode) {
        return res.status(400).json({ success: false, error: 'Missing codes' });
    }

    // שמירת הקשר הדו-כיווני בזיכרון
    localPairs[myCode] = partnerCode;
    localPairs[partnerCode] = myCode;

    console.log(`Successfully paired in memory: ${myCode} <--> ${partnerCode}`);
    
    // החזרת תשובה חיובית לאפליקציה
    res.json({ success: true, message: 'Pairing successful' });
});
