// Receives the launcher's development log from the TV and appends it to logs/tv.jsonl.
// The TV must be able to reach this Mac on the port below (macOS may ask to allow incoming connections).
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.PORT) || 8099;
// The server listens on the whole network, so a log entry larger than this is refused unread.
const MAX_BODY = 64 * 1024;
const dir = resolve(here, '..', 'logs');
const file = resolve(dir, 'tv.jsonl');
mkdirSync(dir, { recursive: true });

createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'POST') {
        res.writeHead(204).end();
        return;
    }
    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
        if (tooLarge) return;
        body += chunk;
        if (body.length > MAX_BODY) {
            tooLarge = true;
            body = '';
            res.writeHead(413, { Connection: 'close' }).end();
            req.destroy();
        }
    });
    req.on('end', () => {
        if (tooLarge) return;
        appendFileSync(file, body.replace(/\n/g, ' ') + '\n');
        try {
            const entry = JSON.parse(body);
            console.log(entry.t, entry.message, entry.data ? '(+data)' : '');
        } catch {
            console.log(body.slice(0, 200));
        }
        res.writeHead(204).end();
    });
}).listen(port, '0.0.0.0', () => {
    console.log(`Dev log listening on port ${port}, writing ${file}`);
});
