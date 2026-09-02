import { createServer } from "node:http";
import { Readable } from "node:stream";
import handler from "./dist/server/server.js";

const port = Number(process.env.PORT || 10000);

function toRequest(request) {
  const protocol = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers.host || `localhost:${port}`;
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(name, entry));
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(`${protocol}://${host}${request.url}`, {
    method: request.method,
    headers,
    body: hasBody ? Readable.toWeb(request) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

async function writeResponse(response, nodeResponse) {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, name) => nodeResponse.setHeader(name, value));

  if (!response.body) {
    nodeResponse.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      nodeResponse.write(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  nodeResponse.end();
}

createServer(async (request, response) => {
  try {
    await writeResponse(await handler.fetch(toRequest(request), process.env, {}), response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.statusCode = 500;
    response.end("Internal server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Frontend server listening on port ${port}`);
});
