exports.handler = async function (event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { prompt, platform } = JSON.parse(event.body);

    if (!prompt) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Prompt kerak!" }) };
    }

    const token = process.env.REPLICATE_API_TOKEN;

    // Har bir platform uchun model va input
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
      return { statusCode: 500, headers, body: JSON.stringify({ error: prediction.detail || "Xato yuz berdi" }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ id: prediction.id, status: prediction.status }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
