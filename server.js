const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const fs = require('fs');
const path = require('path');

// ============================================
// FIREBASE ADMIN SDK (xatoliksiz ishga tushirish)
// ============================================
let admin = null;
let db = null;

try {
  admin = require('firebase-admin');
  
  // Firebase Admin SDK ni ishga tushirish (faqat Environment Variables mavjud bo'lsa)
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
    console.log('⚠️ Firebase Environment Variables topilmadi, kredit tizimi o\'chirilgan');
  }
} catch (err) {
  console.error('⚠️ Firebase Admin SDK xatosi (davom etiladi):', err.message);
}

// ============================================
// KREDIT TEKSHIRISH VA KAMAYTIRISH (MARKAZIY)
// ============================================
async function checkAndUseCredits(uid, amount = 1) {
  // Agar Firebase ishlamasa, kredit tekshirilmaydi
  if (!db || !admin) {
    console.log('⚠️ Firebase ishlamayapti, kredit olinmaydi');
    return { success: true, credits: 999 };
  }

  try {
    if (!uid) {
      return { success: false, error: 'UID kerak!' };
    }

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    
    if (!snap.exists) {
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
    // Xatolik bo'lsa ham davom etish (test uchun)
    return { success: true, credits: 999 };
  }
}

// ============================================
// KREDIT BALANSINI TEKSHIRISH
// ============================================
app.get('/api/get-credits/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: 'UID kerak!' });

    if (!db) {
      return res.json({ credits: 999 });
    }

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    
    if (!snap.exists) {
      return res.json({ credits: 3 });
    }
    
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

// Uploads papkasi
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// ============================================
// 1. PROMPT ASOSIDA VIDEO YARATISH (5 ta AI model)
// ============================================
app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, platform, uid } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt kerak!' });
    if (!uid) return res.status(400).json({ error: 'UID kerak!' });

    // Kredit tekshirish
    const creditCheck = await checkAndUseCredits(uid);
    if (!creditCheck.success) {
      return res.status(400).json({ error: creditCheck.error });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    const models = {
      minimax: { version: "minimax/video-01", input: { prompt, prompt_optimizer: true } },
      runway: { version: "luma/ray-flash-2-540p", input: { prompt, duration: 5, aspect_ratio: "16:9" } },
      pika: { version: "minimax/video-01-live", input: { prompt, prompt_optimizer: true } },
      hailuo: { version: "minimax/video-01", input: { prompt, prompt_optimizer: true } },
      seedance: { version: "bytedance/seedance-1-lite", input: { prompt, duration: 5, resolution: "480p", watermark: false } }
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

    res.json({ 
      id: data.id, 
      status: data.status,
      credits: creditCheck.credits
    });
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

    // Kredit tekshirish
    const creditCheck = await checkAndUseCredits(uid);
    if (!creditCheck.success) {
      return res.status(400).json({ error: creditCheck.error });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    // Rasmni saqlash
    const base64Data = image.split(',')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const timestamp = Date.now();
    const filename = `image_${timestamp}.jpg`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, imageBuffer);

    const imageUrl = `https://videoai-did4.onrender.com/uploads/${filename}`;
    console.log('🖼️ Rasm saqlandi:', filename);
    console.log('📝 Prompt:', prompt);

    // Replicate API - rasmni videoga aylantirish
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

    res.json({ 
      success: true, 
      id: data.id, 
      status: data.status,
      credits: creditCheck.credits,
      message: 'Rasm jonlantirilmoqda...'
    });

  } catch (err) {
    console.error('❌ image-to-video xatosi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 4. VIDEONI TAHRIRLASH (EDIT)
// ============================================
app.post('/api/edit-video', async (req, res) => {
  try {
    const { video, prompt, uid } = req.body;
    
    if (!video) return res.status(400).json({ error: 'Video yuklanmagan!' });
    if (!prompt) return res.status(400).json({ error: 'Prompt yozilmagan!' });
    if (!uid) return res.status(400).json({ error: 'UID kerak!' });

    // Kredit tekshirish
    const creditCheck = await checkAndUseCredits(uid);
    if (!creditCheck.success) {
      return res.status(400).json({ error: creditCheck.error });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    // Videoni saqlash
    const base64Data = video.split(',')[1];
    const videoBuffer = Buffer.from(base64Data, 'base64');
    const timestamp = Date.now();
    const filename = `video_${timestamp}.mp4`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, videoBuffer);

    const videoUrl = `https://videoai-did4.onrender.com/uploads/${filename}`;
    console.log('📹 Video saqlandi:', filename);
    console.log('📝 Prompt:', prompt);

    // Replicate API - video tahrirlash
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "wan-video/wan-2.7-videoedit",
        input: {
          video: videoUrl,
          prompt: prompt,
          resolution: '720p',
          audio_setting: 'origin'
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.detail || 'Replicate xatosi' });
    }

    res.json({ 
      success: true, 
      id: data.id, 
      status: data.status,
      credits: creditCheck.credits,
      message: 'Video tahrirlanmoqda...'
    });

  } catch (err) {
    console.error('❌ edit-video xatosi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 5. RASMNI JONLANTIRISH + GAPIRISH (LIP-SYNC)
// ============================================
app.post('/api/animate-image-with-audio', async (req, res) => {
  try {
    const { image, text, uid } = req.body;
    
    if (!image) return res.status(400).json({ error: 'Rasm yuklanmagan!' });
    if (!text) return res.status(400).json({ error: 'Matn yozilmagan!' });
    if (!uid) return res.status(400).json({ error: 'UID kerak!' });

    // Kredit tekshirish (2 kredit: audio + video)
    const creditCheck = await checkAndUseCredits(uid, 2);
    if (!creditCheck.success) {
      return res.status(400).json({ error: creditCheck.error });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    // Rasmni saqlash
    const base64Data = image.split(',')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const timestamp = Date.now();
    const imageFilename = `speak_image_${timestamp}.jpg`;
    const imagePath = path.join(uploadsDir, imageFilename);
    fs.writeFileSync(imagePath, imageBuffer);
    const imageUrl = `https://videoai-did4.onrender.com/uploads/${imageFilename}`;

    console.log('🖼️ Rasm saqlandi:', imageFilename);
    console.log('📝 Matn:', text);

    // 1. Matnni audioga aylantirish (TTS - Edge TTS orqali)
    // Replicate'da audio yaratish
    const audioResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "suno-ai/bark",
        input: {
          prompt: text,
          text: text,
          voice: "v2/en_speaker_6"
        }
      })
    });

    const audioData = await audioResponse.json();
    if (!audioResponse.ok) {
      return res.status(500).json({ error: audioData.detail || 'Audio yaratish xatosi' });
    }

    // Audio tugashini kutish
    let audioAttempts = 0;
    let audioUrl = null;
    while (audioAttempts < 30) {
      const checkAudio = await fetch(`https://api.replicate.com/v1/predictions/${audioData.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const audioStatus = await checkAudio.json();
      
      if (audioStatus.status === 'succeeded') {
        audioUrl = audioStatus.output;
        break;
      } else if (audioStatus.status === 'failed') {
        return res.status(500).json({ error: 'Audio yaratish muvaffaqiyatsiz' });
      }
      audioAttempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!audioUrl) {
      return res.status(500).json({ error: 'Audio yaratish vaqti tugadi' });
    }

    // 2. Rasm + Audio → Gapiruvchi video (Wav2Lip)
    const videoResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "anotherjesse/wav2lip",
        input: {
          face: imageUrl,
          audio: audioUrl,
          resize_factor: 1,
          pads: [0, 10, 0, 0],
          wav2lip_batch_size: 1
        }
      })
    });

    const videoData = await videoResponse.json();
    if (!videoResponse.ok) {
      return res.status(500).json({ error: videoData.detail || 'Video yaratish xatosi' });
    }

    res.json({
      success: true,
      id: videoData.id,
      status: videoData.status,
      credits: creditCheck.credits,
      message: 'Rasm jonlantirilmoqda...'
    });

  } catch (err) {
    console.error('❌ animate-image-with-audio xatosi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 6. UMUMIY GENERATSIYA
// ============================================
app.post('/api/generate-from-video', async (req, res) => {
  try {
    const { video, prompt, mode, uid } = req.body;
    
    if (!video) return res.status(400).json({ error: 'Video yoki rasm yuklanmagan!' });

    // Kredit tekshirish (faqat generatsiya uchun)
    let creditCheck = { success: true };
    if (uid && (mode === 'image-to-video' || mode === 'edit-video')) {
      creditCheck = await checkAndUseCredits(uid);
      if (!creditCheck.success) {
        return res.status(400).json({ error: creditCheck.error });
      }
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    // Faylni saqlash
    const base64Data = video.split(',')[1];
    const videoBuffer = Buffer.from(base64Data, 'base64');
    const timestamp = Date.now();
    const ext = mode === 'image-to-video' ? 'jpg' : 'mp4';
    const filename = `upload_${timestamp}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, videoBuffer);

    const fileUrl = `https://videoai-did4.onrender.com/uploads/${filename}`;
    console.log('📁 Fayl saqlandi:', filename);
    console.log('📝 Prompt:', prompt);
    console.log('🔧 Mode:', mode);

    // Mode bo'yicha model tanlash
    let model, input;
    
    if (mode === 'image-to-video') {
      model = "wan-video/wan-2.2-i2v-fast";
      input = {
        image: fileUrl,
        prompt: prompt || 'Animate this image with natural movement'
      };
    } else if (mode === 'edit-video') {
      model = "wan-video/wan-2.7-videoedit";
      input = {
        video: fileUrl,
        prompt: prompt || 'Enhance this video',
        resolution: '720p',
        audio_setting: 'origin'
      };
    } else {
      // Faqat saqlash (bepul)
      return res.json({ 
        success: true, 
        videoUrl: fileUrl,
        message: 'Video saqlandi!'
      });
    }

    // Replicate API ga so'rov
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: model,
        input: input
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.detail || 'Replicate xatosi' });
    }

    res.json({ 
      success: true, 
      id: data.id, 
      status: data.status,
      credits: creditCheck.success ? creditCheck.credits : undefined,
      message: 'Generatsiya boshlandi!'
    });

  } catch (err) {
    console.error('❌ Xato:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 7. VIDEONI SAQLASH (BEPUL)
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
// 8. BARCHA FAYLLARNI KO'RISH
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
// 9. ROOT
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
