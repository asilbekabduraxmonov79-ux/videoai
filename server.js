const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// API: Video yaratish
app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, platform } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt kerak!' });

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'Token yo\'q' });

    const models = {
      minimax: { url: 'https://api.replicate.com/v1/models/minimax/video-01/predictions', input: { prompt, prompt_optimizer: true } },
      runway: { url: 'https://api.replicate.com/v1/models/luma/ray-flash-2-540p/predictions', input: { prompt, duration: 5, aspect_ratio: '16:9' } },
      pika: { url: 'https://api.replicate.com/v1/models/minimax/video-01-live/predictions', input: { prompt, prompt_optimizer: true } },
      hailuo: { url: 'https://api.replicate.com/v1/models/minimax/video-01/predictions', input: { prompt, prompt_optimizer: true } },
      seedance: { url: 'https://api.replicate.com/v1/models/bytedance/seedance-1-lite/predictions', input: { prompt, duration: 5, resolution: '480p', watermark: false } }
    };

    const selected = models[platform] || models.minimax;
    const response = await fetch(selected.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: selected.input })
    });

    const text = await response.text();
    if (!text || text.trim() === '') {
      return res.status(500).json({ error: 'Replicate bo\'sh javob' });
    }

    const prediction = JSON.parse(text);
    if (!response.ok) {
      return res.status(500).json({ error: prediction.detail || 'Replicate xatosi' });
    }

    res.json({ id: prediction.id, status: prediction.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Holatni tekshirish
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

app.listen(port, () => console.log(`Server running on port ${port}`));
