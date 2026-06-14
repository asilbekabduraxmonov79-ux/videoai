exports.handler = async function (event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const { id } = event.queryStringParameters || {};

  if (!id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "ID kerak" }) };
  }

  try {
    const token = process.env.REPLICATE_API_TOKEN;

    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    const data = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: data.id,
        status: data.status,
        output: data.output,
        error: data.error,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

