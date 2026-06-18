export async function onRequestPost(context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const { prompt, platform } = await context.request.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt kerak!" }), { status: 400, headers });
    }

    const token = context.env.REPLICATE_API_TOKEN;

    const models = {
      minimax: {
        url: "https://api.replicate.com/v1/models/minimax/video-01/predictions",
        input: { prompt, prompt_optimizer: true }
      },
      runway: {
        url: "https://api.replicate.com/v1/models/luma/ray-flash-2-540p/predictions",
        input: { prompt, duration: 5, aspect_ratio: "16:9" }
      },
      pika: {
        url: "https://api.replicate.com/v1/models/minimax/video-01-live/predictions",
        input: { prompt, prompt_optimizer: true }
      },
      hailuo: {
        url: "https://api.replicate.com/v1/models/minimax/video-01/predictions",
        input: { prompt, prompt_optimizer: true }
      },
      seedance: {
        url: "https://api.replicate.com/v1/models/bytedance/seedance-1-lite/predictions",
        input: { prompt, duration: 5, resolution: "480p", watermark: false }
      }
    };

    const selected = models[platform] || models.minimax;

    const response = await fetch(selected.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: selected.input }),
    });

    const prediction = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: prediction.detail || "Xato yuz berdi" }), { status: 500, headers });
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
