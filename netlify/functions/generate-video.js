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
    const { prompt } = JSON.parse(event.body);

    if (!prompt) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Prompt kerak!" }) };
    }

    const token = process.env.REPLICATE_API_TOKEN;

    const response = await fetch("https://api.replicate.com/v1/models/minimax/video-01/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { prompt: prompt, prompt_optimizer: true },
      }),
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

