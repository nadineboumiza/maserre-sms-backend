const express  = require('express');
const twilio   = require('twilio');
const crypto   = require('crypto');

const app  = express();
app.use(express.json());

// ── Config Twilio (remplacez par vos vraies clés) ──
const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ── Stockage temporaire des codes (en mémoire) ─────
// Code expire après 10 minutes
const codes = new Map();

// ── Générer code à 6 chiffres ──────────────────────
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ══════════════════════════════════════════════════
//  POST /send-code
//  Body: { phone: "+21612345678" }
// ══════════════════════════════════════════════════
app.post('/send-code', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Numéro de téléphone requis.',
    });
  }

  // Valider format international
  if (!phone.startsWith('+')) {
    return res.status(400).json({
      success: false,
      message: 'Le numéro doit commencer par + (ex: +21612345678).',
    });
  }

  const code    = generateCode();
  const expires = Date.now() + 10 * 60 * 1000; // 10 min

  // Stocker code + expiration
  codes.set(phone, { code, expires });

  try {
    await client.messages.create({
      body: `Votre code Ma Serre : ${code}\nValable 10 minutes.`,
      from: TWILIO_PHONE_NUMBER,
      to:   phone,
    });

    console.log(`SMS envoyé à ${phone} : ${code}`);

    return res.json({
      success: true,
      message: 'Code SMS envoyé avec succès.',
    });
  } catch (error) {
    console.error('Erreur Twilio:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erreur envoi SMS : ' + error.message,
    });
  }
});

// ══════════════════════════════════════════════════
//  POST /verify-code
//  Body: { phone: "+21612345678", code: "123456" }
// ══════════════════════════════════════════════════
app.post('/verify-code', (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({
      success: false,
      message: 'Numéro et code requis.',
    });
  }

  const stored = codes.get(phone);

  // Code inexistant
  if (!stored) {
    return res.status(400).json({
      success: false,
      message: 'Aucun code envoyé à ce numéro.',
    });
  }

  // Code expiré
  if (Date.now() > stored.expires) {
    codes.delete(phone);
    return res.status(400).json({
      success: false,
      message: 'Code expiré. Demandez un nouveau code.',
    });
  }

  // Code incorrect
  if (stored.code !== code) {
    return res.status(400).json({
      success: false,
      message: 'Code incorrect.',
    });
  }

  // ✅ Code correct → supprimer et valider
  codes.delete(phone);

  return res.json({
    success: true,
    message: 'Numéro vérifié avec succès.',
  });
});

// ── Health check ───────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'Ma Serre SMS API is running 🌱' });
});

// ── Démarrage ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
