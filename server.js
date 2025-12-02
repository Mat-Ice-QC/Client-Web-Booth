const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// --- Global Configuration ---
const PORT = process.env.PORT || 3000;

// Rate Limiting Settings
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; 
const RATE_LIMIT_MAX_REQUESTS = 1000;        

// Upload Specific Settings
const MAX_UPLOADS_PER_MINUTE = 20;           
const MAX_FILE_SIZE_MB = 50; 
const UPLOAD_TIMEOUT_MS = 60000;             

// File Validation Settings
const ALLOWED_MIME_TYPES = [
    'image/png', 
    'image/jpeg', 
    'image/gif', 
    'image/webp'
];

// --- Directories ---
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbnails'); 
const OVERLAY_DIR = path.join(__dirname, 'overlays');

const app = express();

// --- CRITICAL FIX: Trust Nginx Proxy ---
// This tells Express to respect the 'X-Forwarded-For' header sent by Nginx
app.set('trust proxy', true); 

// --- Security: Rate Limiting ---
const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS, 
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: MAX_UPLOADS_PER_MINUTE, 
    message: "Too many uploads, please try again later."
});

// --- Middleware ---
app.use(helmet({
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false
}));

app.use(limiter);
app.use(bodyParser.json({ limit: `${MAX_FILE_SIZE_MB}mb` })); 

app.use(express.static(__dirname)); 
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/overlays', express.static(OVERLAY_DIR));

// --- Init Directories ---
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR); 
if (!fs.existsSync(OVERLAY_DIR)) fs.mkdirSync(OVERLAY_DIR);

// --- Helpers ---
function getBufferMimeType(buffer) {
    if (!buffer || buffer.length < 4) return 'unknown';
    const header = buffer.toString('hex', 0, 4);
    switch (header) {
        case '89504e47': return 'image/png';
        case 'ffd8ffe0': case 'ffd8ffe1': case 'ffd8ffe2': case 'ffd8ffe3': case 'ffd8ffe8': return 'image/jpeg';
        case '47494638': return 'image/gif';
        case '52494646': if (buffer.length >= 12 && buffer.toString('hex', 8, 12) === '57454250') return 'image/webp'; return 'unknown';
        default: return 'unknown';
    }
}

function parseUserAgent(ua) {
    if (!ua) return { os: 'Unknown', browser: 'Unknown', arch: 'Unknown' };
    let os = 'Unknown OS';
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iOS/.test(ua)) os = 'iOS';

    return { os }; 
}

function getPngDimensions(buffer) {
    if (buffer.length > 24 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
    }
    return null;
}

// --- Endpoints ---

// Debug Endpoint: Returns IP and logs headers to server console
app.get('/my-ip', (req, res) => {
    // If 'trust proxy' is set, req.ip is automatically populated from X-Forwarded-For
    const ip = req.ip; 
    
    // Log headers to console so you can see if Nginx is sending X-Forwarded-For
    // console.log("--- DEBUG /my-ip ---");
    // console.log("Detected IP:", ip);
    // console.log("X-Forwarded-For Header:", req.headers['x-forwarded-for']);
    
    res.json({ ip });
});

app.get('/overlays-list', (req, res) => {
    fs.readdir(OVERLAY_DIR, (err, files) => {
        if (err) return res.json([]);
        const safeFiles = files.filter(file => {
            return !file.startsWith('.') && /\.(png|jpe?g|gif|webp)$/i.test(file);
        });
        res.json(safeFiles);
    });
});

app.post('/upload', uploadLimiter, (req, res) => {
    req.setTimeout(UPLOAD_TIMEOUT_MS);

    try {
        const { image, thumbnail, width, height } = req.body;
        
        // Use req.ip for robust logging
        const clientIp = req.ip;
        const rawUa = req.get('User-Agent');
        const uaInfo = parseUserAgent(rawUa);

        console.log(`[UPLOAD ATTEMPT] IP: ${clientIp} | OS: ${uaInfo.os}`);

        if (!image || typeof image !== 'string') {
            return res.status(400).json({ message: 'Invalid input data.' });
        }

        const matches = image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ message: 'Invalid image format.' });

        const declaredType = matches[1]; 
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const actualMime = getBufferMimeType(buffer);
        
        if (!ALLOWED_MIME_TYPES.includes(actualMime)) {
            return res.status(400).json({ message: 'Invalid file type detected.' });
        }

        if (buffer.length > MAX_FILE_SIZE_MB * 1024 * 1024) { 
            return res.status(400).json({ message: 'Image too large.' });
        }

        const timestamp = Date.now();
        let ext = 'png';
        if (actualMime === 'image/jpeg') ext = 'jpg';
        
        const safeFilename = `capture_${timestamp}.${ext}`;
        const filePath = path.join(UPLOAD_DIR, safeFilename);

        // --- PROCESS THUMBNAIL ---
        if (thumbnail && typeof thumbnail === 'string') {
            const thumbMatches = thumbnail.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
            if (thumbMatches && thumbMatches.length === 3) {
                const thumbBuffer = Buffer.from(thumbMatches[2], 'base64');
                const thumbFilename = `capture_${timestamp}_thumb.jpg`; 
                const thumbPath = path.join(THUMB_DIR, thumbFilename);
                
                fs.writeFile(thumbPath, thumbBuffer, (err) => {
                    if(err) console.error("Failed to save thumbnail", err);
                    else console.log(`[THUMBNAIL] IP: ${clientIp} | Saved: ${thumbFilename} (${(thumbBuffer.length/1024).toFixed(2)}KB)`);
                });
            }
        }

        fs.writeFile(filePath, buffer, (err) => {
            if (err) {
                console.error("Write error:", err);
                return res.status(500).json({ message: 'Internal Server Error' });
            }
            
            const realDims = getPngDimensions(buffer);
            const confirmedRes = realDims ? `${realDims.width}x${realDims.height}` : 'N/A';

            console.log(`[SECURE UPLOAD] IP: ${clientIp} | Saved: ${safeFilename} | Size: ${(buffer.length/1024).toFixed(2)}KB | Res: ${confirmedRes}`);
            res.json({ message: 'Saved successfully', filename: safeFilename });
        });

    } catch (e) {
        console.error("Upload exception:", e);
        res.status(500).json({ message: 'Server error processing upload.' });
    }
});

app.get('/gallery-data', (req, res) => {
    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) return res.json([]);

        const safeImages = files
            .filter(file => {
                return !file.startsWith('.') && 
                       fs.statSync(path.join(UPLOAD_DIR, file)).isFile() && 
                       /\.(png|jpe?g|webp|gif)$/i.test(file);
            })
            .map(file => path.basename(file)); 

        res.json(safeImages);
    });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`---------------------------------------------------`);
    console.log(`SECURE HTTP Server running at port: ${PORT}`);
    console.log(`---------------------------------------------------`);
});

server.timeout = UPLOAD_TIMEOUT_MS;