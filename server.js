const express  = require('express');
const twilio   = require('twilio');
const admin    = require('firebase-admin');

const app = express();
app.use(express.json());

// ── Config Twilio ──────────────────────────────────
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ── Config Firebase Admin ──────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY
                   .replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

// ── Générer code à 6 chiffres ──────────────────────
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000)
    .toString();
}

// ══════════════════════════════════════════════════
//  POST /send-code
// ══════════════════════════════════════════════════
app.post('/send-code', async (req, res) => {
  const { phone } = req.body;

  if (!phone || !phone.startsWith('+')) {
    return res.status(400).json({
      success: false,
      message: 'Numéro invalide. Format: +21612345678',
    });
  }

  const code    = generateCode();
  const expires = Date.now() + 10 * 60 * 1000;

  try {
    await db.collection('sms_codes').doc(phone).set({
      code,
      expires,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await client.messages.create({
      body: `Votre code Ma Serre : ${code}\nValable 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   phone,
    });

    console.log(`SMS envoye a ${phone} : ${code}`);

    return res.json({
      success: true,
      message: 'Code SMS envoyé avec succès.',
    });
  } catch (error) {
    console.error('Erreur:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erreur : ' + error.message,
    });
  }
});

// ══════════════════════════════════════════════════
//  POST /verify-code
// ══════════════════════════════════════════════════
app.post('/verify-code', async (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({
      success: false,
      message: 'Numéro et code requis.',
    });
  }

  try {
    const doc = await db
      .collection('sms_codes')
      .doc(phone)
      .get();

    if (!doc.exists) {
      return res.status(400).json({
        success: false,
        message: 'Aucun code envoyé à ce numéro.',
      });
    }

    const stored = doc.data();

    if (Date.now() > stored.expires) {
      await doc.ref.delete();
      return res.status(400).json({
        success: false,
        message: 'Code expiré. Demandez un nouveau code.',
      });
    }

    if (stored.code !== code) {
      return res.status(400).json({
        success: false,
        message: 'Code incorrect. Réessayez.',
      });
    }

    await doc.ref.delete();

    return res.json({
      success: true,
      message: 'Numéro vérifié avec succès.',
    });
  } catch (error) {
    console.error('Erreur:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur : ' + error.message,
    });
  }
});

// ══════════════════════════════════════════════════
//  POST /send-alert  ← NOUVEAU
//  Body: { phone, message }
// ══════════════════════════════════════════════════
app.post('/send-alert', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({
      success: false,
      message: 'Numéro et message requis.',
    });
  }

  try {
    await client.messages.create({
      body: `🌱 Ma Serre — ALERTE :\n${message}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   phone,
    });

    console.log(`Alerte SMS envoyee a ${phone} : ${message}`);

    return res.json({
      success: true,
      message: 'Alerte SMS envoyée.',
    });
  } catch (error) {
    console.error('Erreur alerte:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erreur : ' + error.message,
    });
  }
});

// ── Health check ───────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'Ma Serre SMS API is running' });
});

// ── Démarrage ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
