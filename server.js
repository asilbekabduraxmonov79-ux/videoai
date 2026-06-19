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

    // 5 TA AI MODEL
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
// 3. Yuklangan videoni generatsiya qilish (VIDEO-TO-VIDEO)
// ============================================
app.post('/api/generate-from-video', async (req, res) => {
  try {
    const { video, prompt, platform } = req.body;
    
    if (!video) return res.status(400).json({ error: 'Video yuklanmagan!' });
    if (!prompt) return res.status(400).json({ error: 'Prompt yozilmagan!' });

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN yo\'q' });

    // 1. Videoni vaqtinchalik faylga saqlash
    const base64Data = video.split(',')[1];
    const videoBuffer = Buffer.from(base64Data, 'base64');
    const timestamp = Date.now();
    const filename = `upload_${timestamp}.mp4`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, videoBuffer);

    console.log('📹 Video saqlandi:', filename);
    console.log('📝 Prompt:', prompt);
    console.log('🤖 Platform:', platform);

    // 2. Video-to-video generatsiya
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "stability-ai/stable-video-diffusion",
        input: {
          input_video: `https://videoai-did4.onrender.com/uploads/${filename}`,
          prompt: prompt,
          video_length: 25,
          frames_per_second: 8,
          motion_bucket_id: 127
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.detail || 'Replicate xatosi' });
    }

    // 3. Holatni kuzatish
    let attempts = 0;
    const maxAttempts = 30;
    
    const checkStatus = async () => {
      const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const statusData = await statusRes.json();
      
      if (statusData.status === 'succeeded') {
        return { success: true, videoUrl: statusData.output, id: statusData.id };
      } else if (statusData.status === 'failed') {
        return { success: false, error: statusData.error || 'Generatsiya muvaffaqiyatsiz' };
      } else {
        if (attempts >= maxAttempts) {
          return { success: false, error: 'Vaqt tugadi' };
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 3000));
        return checkStatus();
      }
    };

    const result = await checkStatus();
    
    if (result.success) {
      res.json({
        success: true,
        videoUrl: result.videoUrl,
        id: result.id,
        message: 'Video generatsiya qilindi!'
      });
    } else {
      res.status(500).json({ error: result.error });
    }

  } catch (err) {
    console.error('❌ generate-from-video xatosi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 4. Yuklangan videoni saqlash
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
// 5. Barcha videolarni ko'rish
// ============================================
app.get('/api/videos', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const videos = files.filter(f => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mov'));
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
// 6. Root
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
