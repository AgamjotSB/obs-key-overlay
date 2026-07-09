import { spawn } from "bun";
import { join } from "path";

const BASE_DIR = "/usr/share/obs-key-overlay";

const server = Bun.serve({
    port: 8080,
    hostname: "127.0.0.1",
    async fetch(req, server) {
        // Handle WebSocket upgrade
        if (server.upgrade(req)) {
            return;
        }

        const url = new URL(req.url);

        // Serve the overlay HTML
        if (url.pathname === "/" || url.pathname === "/overlay.html") {
            const file = Bun.file(join(BASE_DIR, "overlay.html"));
            return new Response(file, {
                headers: { "Content-Type": "text/html" },
            });
        }

        // Serve the compiled CSS
        if (url.pathname === "/output.css") {
            const file = Bun.file(join(BASE_DIR, "output.css"));
            return new Response(file, {
                headers: { "Content-Type": "text/css" },
            });
        }

        return new Response("Not Found", { status: 404 });
    },
    websocket: {
        open(ws) {
            console.log("Client connected to OBS overlay");
            ws.subscribe("keys");
        },
        message(_ws, _message) {},
        close(ws) {
            console.log("Client disconnected");
            ws.unsubscribe("keys");
        },
    },
});

console.log(`Server running at http://127.0.0.1:${server.port}`);

const smtk = spawn(["pkexec", "stdbuf", "-oL", "showmethekey-cli"], {
    stdout: "pipe",
    stderr: "inherit",
});

// const smtk = spawn(["stdbuf", "-oL", "showmethekey-cli"], {
//     stdout: "pipe",
//     stderr: "inherit",
// });

const reader = smtk.stdout.getReader();
const decoder = new TextDecoder();
let buffer = "";

async function processStream() {
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.trim() === "") continue;
                try {
                    const parsed = JSON.parse(line);
                    server.publish("keys", JSON.stringify(parsed));
                } catch (e) {
                    console.error("Error parsing line:", e);
                }
            }
        }
    } catch (err) {
        console.error("Error reading stream:", err);
    }
}

processStream();
