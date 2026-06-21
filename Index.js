const functions = require("firebase-functions");
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // או איך שקראת לקובץ המפתח שלך

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket:'echotrace.appspot.com'
});

const bucket = admin.storage().bucket(); // שורה 6 שלא תזרוק יותר שגיאה!

const db = admin.firestore();
const bucket = admin.storage().bucket();

// 1. רישום מכשיר ועדכון FCM Token
exports.register = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { deviceId, fcmToken } = req.body;
    if (!deviceId || !fcmToken) return res.status(400).send("Missing parameters");

    try {
        await db.collection("devices").doc(deviceId).set({
            fcmToken,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return res.status(200).send({ status: "success" });
    } catch (error) {
        return res.status(500).send({ error: error.message });
    }
});

// 2. יצירת קשר (זיווג) - POST /connect
exports.connect = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { myDeviceId, partnerCode, role } = req.body;
    if (!myDeviceId || !partnerCode) return res.status(400).send("Missing parameters");

    try {
        // בדיקה שהשותף קיים במערכת
        const partnerDoc = await db.collection("devices").doc(partnerCode).get();
        if (!partnerDoc.exists) return res.status(404).send("Partner code not found");

        const connectionId = [myDeviceId, partnerCode].sort().join("_");
        
        await db.collection("connections").doc(connectionId).set({
            userA: myDeviceId,
            userB: partnerCode,
            roles: { [myDeviceId]: role || "default", [partnerCode]: "default" },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // עדכון סטטוס זיווג במכשירים
        await db.collection("devices").doc(myDeviceId).update({ activeConnection: connectionId });
        await db.collection("devices").doc(partnerCode).update({ activeConnection: connectionId });

        return res.status(200).send({ status: "connected", connectionId });
    } catch (error) {
        return res.status(500).send({ error: error.message });
    }
});

// 3. קבלת Signed URL להעלאה
exports.getUploadUrl = functions.https.onRequest(async (req, res) => {
    const { deviceId, filename } = req.body;
    if (!deviceId || !filename) return res.status(400).send("Missing parameters");

    try {
        const file = bucket.file(`traces/${deviceId}/${Date.now()}_${filename}`);
        const [url] = await file.getSignedUrl({
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000, // 15 דקות תוקף
            contentType: 'image/jpeg'
        });
        return res.status(200).send({ uploadUrl: url, fileStoragePath: file.name });
    } catch (error) {
        return res.status(500).send({ error: error.message });
    }
});

// 4. אישור העלאה ושליחת FCM לשותף
exports.confirmUpload = functions.https.onRequest(async (req, res) => {
    const { myDeviceId, fileStoragePath, caption } = req.body;
    
    try {
        const deviceDoc = await db.collection("devices").doc(myDeviceId).get();
        const connectionId = deviceDoc.data().activeConnection;
        if (!connectionId) return res.status(400).send("No active connection");

        const connDoc = await db.collection("connections").doc(connectionId).get();
        const connData = connDoc.data();
        const partnerId = connData.userA === myDeviceId ? connData.userB : connData.userA;

        const partnerDoc = await db.collection("devices").doc(partnerId).get();
        const partnerToken = partnerDoc.data().fcmToken;

        // שמירת מטא-דאטה של ה-Trace
        const traceId = db.collection("traces").doc().id;
        await db.collection("traces").doc(traceId).set({
            connectionId,
            senderId: myDeviceId,
            fileStoragePath,
            caption: caption || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // שליחת התראת FCM שקטה (Data Payload) להפעלת ה-Worker במכשיר השני
        if (partnerToken) {
            const message = {
                token: partnerToken,
                data: {
                    type: "NEW_TRACE",
                    traceId: traceId,
                    caption: caption || ""
                }
            };
            await admin.messaging().send(message);
        }

        return res.status(200).send({ status: "sent", traceId });
    } catch (error) {
        return res.status(500).send({ error: error.message });
    }
});

// 5. הורדת תמונה (Signed URL זמני)
exports.downloadImage = functions.https.onRequest(async (req, res) => {
    const traceId = req.query.traceId;
    if (!traceId) return res.status(400).send("Missing traceId");

    try {
        const traceDoc = await db.collection("traces").doc(traceId).get();
        if (!traceDoc.exists) return res.status(404).send("Trace not found");

        const fileStoragePath = traceDoc.data().fileStoragePath;
        const file = bucket.file(fileStoragePath);

        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000
        });

        return res.status(200).send({ downloadUrl: url });
    } catch (error) {
        return res.status(500).send({ error: error.message });
    }
});

// 6. אישור הורדה ומחיקה מיידית מהענן (עקרון פרטיות בלתי ניתן לשבירה)
exports.confirmDownload = functions.https.onRequest(async (req, res) => {
    const { traceId } = req.body;
    try {
        const traceDoc = await db.collection("traces").doc(traceId).get();
        if (traceDoc.exists) {
            const fileStoragePath = traceDoc.data().fileStoragePath;
            // מחיקה מהסטורג'
            await bucket.file(fileStoragePath).delete().catch(() => {});
            // מחיקה מפיירסטור
            await db.collection("traces").doc(traceId).delete();
        }
        return res.status(200).send({ status: "cleaned_from_cloud" });
    } catch (error) {
        return res.status(500).send({ error: error.message });
    }
});

// 7. בדיקת סטטוס שותף (האם מחק את האפליקציה)
exports.partnerStatus = functions.https.onRequest(async (req, res) => {
    const deviceId = req.query.deviceId;
    try {
        const deviceDoc = await db.collection("devices").doc(deviceId).get();
        if (!deviceDoc.exists || !deviceDoc.data().activeConnection) {
            return res.status(200).send({ status: "disconnected" });
        }
        return res.status(200).send({ status: "connected" });
    } catch (error) {
        return res.status(500).send({ error: error.message });
    }
});
