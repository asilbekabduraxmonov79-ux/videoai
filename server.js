const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const fs = require('fs');
const path = require('path');

// ============================================
// FIREBASE ADMIN SDK
// ============================================
let admin = null;
let db = null;

try {
  admin = require('firebase-admin');
  
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    if (!admin.apps.length) {
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "",
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID || "",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL || ""
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      db = admin.firestore();
      console.log('✅ Firebase Admin SDK initialized');
    }
  } else {
    console.log('⚠️ Firebase Environment Variables topilmadi');
  }
} catch (err) {
  console.error('⚠️ Firebase Admin SDK xatosi:', err.message);
}

// ============================================
// KREDIT TEKSHIRISH
// ============================================
async function checkAndUseCredits(uid, amount = 1) {
  if (!db || !admin) {
    return { success: true, credits: 1 };
  }

  try {
    if (!uid) return { success: false, error: 'UID kerak!' };

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    
    if (!snap.exists()) {
      return { success: false, error: 'Foydalanuvchi topilmadi!' };
    }
    
    const credits = snap.data().credits || 0;
    if (credits < amount) {
      return { success: false, error: 'Kredit yetarli emas! 💎' };
    }
    
    await userRef.update({
      credits: admin.firestore.FieldValue.increment(-amount)
    });
    
    return { success: true, credits: credits - amount };
  } catch (err) {
    console.error('Kredit xatosi:', err);
    return { success: true, credits: 1 };
  }
}

// ============================================
// KREDIT BALANSINI TEKSHIRISH
// ============================================
app.get('/api/get-credits/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: 'UID kerak!' });

    if (!db) return res.json({ credits: 1 });

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    
    if (!snap.exists()) return res.json({ credits: 1 });
    
    res.json({ credits: snap.data().credits || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Middleware
// ============================================
app.use(express.json({ limit: '100mb' }));
app.use(express.static('.'));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// ============================================
// 1. PROMPT ASOSIDA VIDEO YARATISH
// ============================================
app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, platform, uid } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt kerak!' });
    if (!uid) return res.status(400).json({ error: 'UID kerak!' });

    const creditCheck = await checkAndUseCredits(uid);
    if (!creditCheck.success) {
      return res.status(400).json({ error: creditCheck.error });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    const models = {
      minimax: { version: "luma/ray-flash-2-540p", input: { prompt: prompt } },
      runway: { version: "luma/ray-flash-2-540p", input: { prompt: prompt } },
      pika: { version: "luma/ray-flash-2-540p", input: { prompt: prompt } },
      hailuo: { version: "luma/ray-flash-2-540p", input: { prompt: prompt } },
      seedance: { version: "luma/ray-flash-2-540p", input: { prompt: prompt } }
    };

    const selected = models[platform] || models.minimax;
    
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: selected.version,
        input: selected.input
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.detail || 'Replicate xatosi' });
    }

    let attempts = 0;
    const maxAttempts = 40;

    const checkStatus = async () => {
      const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const statusData = await statusRes.json();
      
      if (statusData.status === 'succeeded') {
        const videoUrl = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
        return res.json({
          success: true,
          videoUrl: videoUrl,
          credits: creditCheck.credits,
          message: 'Video tayyor!'
        });
      } else if (statusData.status === 'failed') {
        return res.status(500).json({ error: statusData.error || 'Generatsiya muvaffaqiyatsiz' });
      } else {
        if (attempts >= maxAttempts) {
          return res.status(500).json({ error: 'Vaqt tugadi' });
        }
        attempts++;
        setTimeout(checkStatus, 3000);
      }
    };

    checkStatus();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 2. VIDEO HOLATINI TEKSHIRISH
// ============================================
app.get('/api/check-status', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'ID kerak' });

    const token = process.env.REPLICATE_API_TOKEN;
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    res.json({
      id: data.id,
      status: data.status,
      output: data.output,
      error: data.error
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 3. RASMNI JONLANTIRISH (IMAGE-TO-VIDEO)
// ============================================
app.post('/api/image-to-video', async (req, res) => {
  try {
    const { image, prompt, uid } = req.body;
    
    if (!image) return res.status(400).json({ error: 'Rasm yuklanmagan!' });
    if (!uid) return res.status(400).json({ error: 'UID kerak!' });

    const creditCheck = await checkAndUseCredits(uid);
    if (!creditCheck.success) {
      return res.status(400).json({ error: creditCheck.error });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    const base64Data = image.split(',')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const timestamp = Date.now();
    const filename = `image_${timestamp}.jpg`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, imageBuffer);

    const imageUrl = `https://videoai-did4.onrender.com/uploads/${filename}`;
    console.log('🖼️ Rasm saqlandi:', filename);

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "wan-video/wan-2.2-i2v-fast",
        input: {
          image: imageUrl,
          prompt: prompt || 'Animate this image with natural movement'
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.detail || 'Replicate xatosi' });
    }

    let attempts = 0;
    const maxAttempts = 40;

    const checkStatus = async () => {
      const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const statusData = await statusRes.json();
      
      if (statusData.status === 'succeeded') {
        const videoUrl = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
        return res.json({
          success: true,
          videoUrl: videoUrl,
          credits: creditCheck.credits,
          message: 'Video tayyor!'
        });
      } else if (statusData.status === 'failed') {
        return res.status(500).json({ error: statusData.error || 'Generatsiya muvaffaqiyatsiz' });
      } else {
        if (attempts >= maxAttempts) {
          return res.status(500).json({ error: 'Vaqt tugadi' });
        }
        attempts++;
        setTimeout(checkStatus, 3000);
      }
    };

    checkStatus();

  } catch (err) {
    console.error('❌ image-to-video xatosi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 4. VIDEONI SAQLASH (SINOVDA)
// ============================================
app.post('/api/generate-from-video', async (req, res) => {
  res.json({ 
    success: false, 
    message: '🔧 Hozircha sinovda! Faqat prompt va rasm ishlaydi.' 
  });
});

// ============================================
// 5. VIDEONI SAQLASH (BEPUL)
// ============================================
app.post('/api/upload-video', async (req, res) => {
  try {
    const { video, filename } = req.body;
    if (!video) return res.status(400).json({ error: 'Video yo\'q' });

    const base64Data = video.split(',')[1];
    const videoBuffer = Buffer.from(base64Data, 'base64');
    const name = filename || `video_${Date.now()}.mp4`;
    const filePath = path.join(uploadsDir, name);
    fs.writeFileSync(filePath, videoBuffer);

    res.json({
      success: true,
      message: 'Video saqlandi!',
      filename: name,
      url: `https://videoai-did4.onrender.com/uploads/${name}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 6. BARCHA FAYLLARNI KO'RISH
// ============================================
app.get('/api/videos', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const videos = files.filter(f => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mov') || f.endsWith('.jpg') || f.endsWith('.png'));
    res.json({ 
      videos: videos.map(f => ({
        name: f,
        url: `https://videoai-did4.onrender.com/uploads/${f}`,
        size: fs.statSync(path.join(uploadsDir, f)).size
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 7. ROOT
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// SERVER START
// ============================================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📁 Uploads folder: ${uploadsDir}`);
  console.log(`🌐 URL: https://videoai-did4.onrender.com`);
});
