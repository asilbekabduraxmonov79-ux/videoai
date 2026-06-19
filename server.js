const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const fs = require('fs');
const path = require('path');

// Middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.static('.'));

// Uploads papkasi
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// ============================================
// 1. Prompt asosida video yaratish (5 ta AI model)
// ============================================
app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, platform } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt kerak!' });

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    const models = {
      minimax: {
        version: "minimax/video-01",
        input: { prompt, prompt_optimizer: true }
      },
      runway: {
        version: "luma/ray-flash-2-540p",
        input: { prompt, duration: 5, aspect_ratio: "16:9" }
      },
      pika: {
        version: "minimax/video-01-live",
        input: { prompt, prompt_optimizer: true }
      },
      hailuo: {
        version: "minimax/video-01",
        input: { prompt, prompt_optimizer: true }
      },
      seedance: {
        version: "bytedance/seedance-1-lite",
        input: { prompt, duration: 5, resolution: "480p", watermark: false }
      }
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

    res.json({ id: data.id, status: data.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 2. Video holatini tekshirish
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
// 3. Rasmni videoga aylantirish (IMAGE-TO-VIDEO)
// ============================================
app.post('/api/image-to-video', async (req, res) => {
  try {
    const { image, prompt } = req.body;
    
    if (!image) return res.status(400).json({ error: 'Rasm yuklanmagan!' });

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    // Rasmni vaqtinchalik faylga saqlash
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
      message: 'Rasm jonlantirilmoqda...'
    });

  } catch (err) {
    console.error('❌ image-to-video xatosi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 4. Videoni tahrirlash (VIDEO EDITING)
// ============================================
app.post('/api/edit-video', async (req, res) => {
  try {
    const { video, prompt } = req.body;
    
    if (!video) return res.status(400).json({ error: 'Video yuklanmagan!' });
    if (!prompt) return res.status(400).json({ error: 'Prompt yozilmagan!' });

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    // Videoni vaqtinchalik faylga saqlash
    const base64Data = video.split(',')[1];
    const videoBuffer = Buffer.from(base64Data, 'base64');
    const timestamp = Date.now();
    const filename = `video_${timestamp}.mp4`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, videoBuffer);

    const videoUrl = `https://videoai-did4.onrender.com/uploads/${filename}`;
    console.log('📹 Video saqlandi:', filename);
    console.log('📝 Prompt:', prompt);

    // Replicate API - videoni tahrirlash
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
      message: 'Video tahrirlanmoqda...'
    });

  } catch (err) {
    console.error('❌ edit-video xatosi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 5. Umumiy generatsiya (image-to-video + edit)
// ============================================
app.post('/api/generate-from-video', async (req, res) => {
  try {
    const { video, prompt, mode } = req.body;
    // mode: 'image-to-video' yoki 'edit-video'
    
    if (!video) return res.status(400).json({ error: 'Video yoki rasm yuklanmagan!' });

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    // 1. Faylni saqlash
    const base64Data = video.split(',')[1];
    const videoBuffer = Buffer.from(base64Data, 'base64');
    const timestamp = Date.now();
    const filename = `upload_${timestamp}.${mode === 'image-to-video' ? 'jpg' : 'mp4'}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, videoBuffer);

    const fileUrl = `https://videoai-did4.onrender.com/uploads/${filename}`;
    console.log('📁 Fayl saqlandi:', filename);
    console.log('📝 Prompt:', prompt);
    console.log('🔧 Mode:', mode);

    // 2. Mode bo'yicha model tanlash
    let model, input;
    
    if (mode === 'image-to-video') {
      model = "wan-video/wan-2.2-i2v-fast";
      input = {
        image: fileUrl,
        prompt: prompt || 'Animate this image with natural movement'
      };
    } else {
      model = "wan-video/wan-2.7-videoedit";
      input = {
        video: fileUrl,
        prompt: prompt || 'Enhance this video',
        resolution: '720p',
        audio_setting: 'origin'
      };
    }

    // 3. Replicate API ga so'rov
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
      message: 'Generatsiya boshlandi!'
    });

  } catch (err) {
    console.error('❌ Xato:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 6. Yuklangan videoni saqlash
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
// 7. Barcha videolarni ko'rish
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
// 8. Root
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// Server start
// ============================================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📁 Uploads folder: ${uploadsDir}`);
  console.log(`🌐 URL: https://videoai-did4.onrender.com`);
});
