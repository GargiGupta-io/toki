import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const port = Number.parseInt(process.env.TOKI_BROWSER_FIXTURE_PORT ?? "8788", 10);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

function resolvePath(pathname) {
  const route = pathname === "/" ? "/fixtures/candidate-page.html" : pathname;
  const relative = normalize(decodeURIComponent(route)).replace(/^(\.\.[/\\])+/, "");
  return join(rootDir, relative);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const filePath = resolvePath(url.pathname);
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Not found\n${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Toki browser fixture: http://127.0.0.1:${port}/fixtures/candidate-page.html`);
});
