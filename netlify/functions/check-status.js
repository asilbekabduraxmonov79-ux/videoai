export async function onRequestGet(context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "ID kerak" }), { status: 400, headers });
  }

  try {
    const token = context.env.REPLICATE_API_TOKEN;

    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    const data = await response.json();

    return new Response(JSON.stringify({
      id: data.id,
      status: data.status,
      output: data.output,
      error: data.error,
    }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
