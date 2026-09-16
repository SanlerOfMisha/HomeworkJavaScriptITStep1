const http = require('http');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'data.json');
const EXTERNAL_API =
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

if (!fsSync.existsSync(DATA_FILE)) {
    fsSync.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fsSync.writeFileSync(
        DATA_FILE,
        JSON.stringify({ exercises: [], favorites: [] }, null, 2)
    );
}

function readData() {
    return fs.readFile(DATA_FILE, 'utf-8').then(JSON.parse);
}

function writeData(data) {
    return fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJSON(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += chunk;
        });
        req.on('end', () => resolve(raw));
        req.on('error', reject);
    });
}

async function readJSONBody(req) {
    const raw = await readBody(req);
    return raw ? JSON.parse(raw) : {};
}

async function serve404(res) {
    try {
        const data = await fs.readFile(path.join(PUBLIC_DIR, '404.html'));
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
    }
}

async function serveStatic(res, pathname) {
    const relativePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(PUBLIC_DIR, relativePath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
        await serve404(res);
        return;
    }

    try {
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        });
        res.end(data);
    } catch {
        await serve404(res);
    }
}

function mapExternalExercise(item) {
    return {
        id: item.id,
        name: item.name,
        muscle: (item.primaryMuscles && item.primaryMuscles[0]) || 'С–РЅС€Рµ',
        equipment: item.equipment || 'РЅРµРјР°С”',
        level: item.level || 'beginner',
        category: item.category || 'Р·Р°РіР°Р»СЊРЅРµ',
    };
}

function notFound(res, error) {
    sendJSON(res, 404, { error });
}

async function parseBody(req, res) {
    try {
        return { body: await readJSONBody(req) };
    } catch {
        sendJSON(res, 400, { error: 'РќРµРєРѕСЂРµРєС‚РЅРёР№ JSON Сѓ С‚С–Р»С– Р·Р°РїРёС‚Сѓ' });
        return null;
    }
}

const routes = [
    {
        method: 'GET',
        pattern: /^\/api\/exercises$/,
        handler: async (req, res, url) => {
            const data = await readData();
            let list = data.exercises;

            for (const key of ['muscle', 'equipment', 'level']) {
                const value = url.searchParams.get(key);
                if (value) list = list.filter((item) => item[key] === value);
            }

            const search = url.searchParams.get('search');
            if (search) {
                const q = search.toLowerCase();
                list = list.filter((item) => item.name.toLowerCase().includes(q));
            }

            sendJSON(res, 200, list);
        },
    },
    {
        method: 'GET',
        pattern: /^\/api\/exercises\/stats$/,
        handler: async (req, res) => {
            const data = await readData();
            const byMuscle = {};
            const byLevel = {};

            data.exercises.forEach((item) => {
                byMuscle[item.muscle] = (byMuscle[item.muscle] || 0) + 1;
                byLevel[item.level] = (byLevel[item.level] || 0) + 1;
            });

            sendJSON(res, 200, {
                total: data.exercises.length,
                favorites: data.favorites.length,
                byMuscle,
                byLevel,
            });
        },
    },
    {
        method: 'POST',
        pattern: /^\/api\/exercises\/import$/,
        handler: async (req, res) => {
            let apiResponse;
            try {
                apiResponse = await fetch(EXTERNAL_API);
            } catch {
                sendJSON(res, 502, { error: 'РќРµ РІРґР°Р»РѕСЃСЏ Р·РІРµСЂРЅСѓС‚РёСЃСЏ РґРѕ Р·РѕРІРЅС–С€РЅСЊРѕРіРѕ API' });
                return;
            }

            if (!apiResponse.ok) {
                sendJSON(res, 502, { error: 'Р—РѕРІРЅС–С€РЅС” API РїРѕРІРµСЂРЅСѓР»Рѕ РїРѕРјРёР»РєСѓ' });
                return;
            }

            const raw = await apiResponse.json();
            const mapped = raw.slice(0, 100).map(mapExternalExercise);

            const data = await readData();
            data.exercises = mapped;
            data.favorites = data.favorites.filter((id) => mapped.some((item) => item.id === id));
            await writeData(data);

            sendJSON(res, 201, mapped);
        },
    },
    {
        method: 'POST',
        pattern: /^\/api\/exercises$/,
        handler: async (req, res) => {
            const parsed = await parseBody(req, res);
            if (!parsed) return;
            const { body } = parsed;

            if (
                typeof body.name !== 'string' ||
                !body.name.trim() ||
                typeof body.muscle !== 'string' ||
                !body.muscle.trim()
            ) {
                sendJSON(res, 400, { error: "РџРѕР»СЏ 'name' С‚Р° 'muscle' РѕР±РѕРІ'СЏР·РєРѕРІС–" });
                return;
            }

            const data = await readData();
            const exercise = {
                id: crypto.randomUUID(),
                name: body.name.trim(),
                muscle: body.muscle.trim(),
                equipment: body.equipment || 'РЅРµРјР°С”',
                level: body.level || 'beginner',
                category: body.category || 'Р·Р°РіР°Р»СЊРЅРµ',
            };

            data.exercises.push(exercise);
            await writeData(data);

            sendJSON(res, 201, exercise);
        },
    },
    {
        method: 'PUT',
        pattern: /^\/api\/exercises\/([^/]+)$/,
        handler: async (req, res, url, [id]) => {
            const parsed = await parseBody(req, res);
            if (!parsed) return;

            const data = await readData();
            const exercise = data.exercises.find((item) => item.id === id);
            if (!exercise) return notFound(res, 'Р’РїСЂР°РІСѓ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');

            Object.assign(exercise, parsed.body, { id: exercise.id });
            await writeData(data);

            sendJSON(res, 200, exercise);
        },
    },
    {
        method: 'DELETE',
        pattern: /^\/api\/exercises\/([^/]+)$/,
        handler: async (req, res, url, [id]) => {
            const data = await readData();
            const index = data.exercises.findIndex((item) => item.id === id);
            if (index === -1) return notFound(res, 'Р’РїСЂР°РІСѓ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');

            data.exercises.splice(index, 1);
            data.favorites = data.favorites.filter((favId) => favId !== id);
            await writeData(data);

            sendJSON(res, 200, { message: 'Р’РёРґР°Р»РµРЅРѕ', id });
        },
    },
    {
        method: 'GET',
        pattern: /^\/api\/favorites$/,
        handler: async (req, res) => {
            const data = await readData();
            sendJSON(res, 200, data.favorites);
        },
    },
    {
        method: 'POST',
        pattern: /^\/api\/favorites\/([^/]+)$/,
        handler: async (req, res, url, [id]) => {
            const data = await readData();
            if (!data.exercises.some((item) => item.id === id)) {
                return notFound(res, 'Р’РїСЂР°РІСѓ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
            }

            if (!data.favorites.includes(id)) {
                data.favorites.push(id);
                await writeData(data);
            }

            sendJSON(res, 201, data.favorites);
        },
    },
    {
        method: 'DELETE',
        pattern: /^\/api\/favorites\/([^/]+)$/,
        handler: async (req, res, url, [id]) => {
            const data = await readData();
            if (!data.favorites.includes(id)) {
                return notFound(res, 'Р’РїСЂР°РІСѓ РЅРµ РґРѕРґР°РЅРѕ РІ РѕР±СЂР°РЅРµ');
            }

            data.favorites = data.favorites.filter((favId) => favId !== id);
            await writeData(data);

            sendJSON(res, 200, data.favorites);
        },
    },
];

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const { pathname } = url;

        console.log(`${req.method} ${pathname}`);

        if (!pathname.startsWith('/api/')) {
            if (req.method === 'GET') await serveStatic(res, pathname);
            else await serve404(res);
            return;
        }

        let route, match;
        for (const r of routes) {
            if (r.method !== req.method) continue;
            match = pathname.match(r.pattern);
            if (match) {
                route = r;
                break;
            }
        }

        if (!route) return notFound(res, 'Route РЅРµ Р·РЅР°Р№РґРµРЅРѕ');

        await route.handler(req, res, url, match.slice(1).map(decodeURIComponent));
    } catch (error) {
        console.error(error);
        sendJSON(res, 500, { error: 'Р’РЅСѓС‚СЂС–С€РЅСЏ РїРѕРјРёР»РєР° СЃРµСЂРІРµСЂР°' });
    }
});

server.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});