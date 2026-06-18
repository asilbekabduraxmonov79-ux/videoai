export async function onRequestPost(context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const body = await context.request.text();
    if (!body) {
      return new Response(JSON.stringify({ error: "Body bo'sh" }), { status: 400, headers });
    }
    
    const { prompt, platform } = JSON.parse(body);

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt kerak!" }), { status: 400, headers });
    }

    const token = context.env.REPLICATE_API_TOKEN || "r8_LAHhovtmITvC2hzIfREBkbWQJFytQzo1UcZ4B";
    
    if (!token) {
      return new Response(JSON.stringify({ error: "Token yo'q" }), { status: 500, headers });
    }

    const models = {
      minimax: { url: "https://api.replicate.com/v1/models/minimax/video-01/predictions", input: { prompt, prompt_optimizer: true } },
      runway: { url: "https://api.replicate.com/v1/models/luma/ray-flash-2-540p/predictions", input: { prompt, duration: 5, aspect_ratio: "16:9" } },
      pika: { url: "https://api.replicate.com/v1/models/minimax/video-01-live/predictions", input: { prompt, prompt_optimizer: true } },
      hailuo: { url: "https://api.replicate.com/v1/models/minimax/video-01/predictions", input: { prompt, prompt_optimizer: true } },
      seedance: { url: "https://api.replicate.com/v1/models/bytedance/seedance-1-lite/predictions", input: { prompt, duration: 5, resolution: "480p", watermark: false } }
    };

    const selected = models[platform] || models.minimax;

    const response = await fetch(selected.url, {
      method: "POST",
      headers: {
        "Authorization": `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: selected.input }),
    });

    const text = await response.text();
    
    let prediction;
    try {
      prediction = JSON.parse(text);
    } catch(e) {
      return new Response(JSON.stringify({ error: "Replicate javob: " + text.substring(0, 200) }), { status: 500, headers });
    }

    if (!response.ok) {
      return new Response(JSON.stringify({ error: prediction.detail || JSON.stringify(prediction) }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ id: prediction.id, status: prediction.status }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response("", {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    }
  });
}
