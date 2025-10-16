export default async function handler(req, res) {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing URL");

    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const data = await response.arrayBuffer();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", contentType);
    res.send(Buffer.from(data));
  } catch (err) {
    res.status(500).send("Proxy Error: " + err.message);
  }
}