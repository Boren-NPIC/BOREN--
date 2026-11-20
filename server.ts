import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const ROOT_DIR = process.cwd();
const UPLOADS_DIR = path.resolve(ROOT_DIR, '.uploads');
const TMP_DIR = path.resolve(UPLOADS_DIR, 'tmp');
const MEDIA_DIR = path.resolve(UPLOADS_DIR, 'media');
const STREAM_SECRET = process.env.STREAM_SIGNING_SECRET || 'borina-tv-dev-signing-secret-change-me';

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Load Firebase projectId from firebase-applet-config.json for ID token verification (needs no IAM)
let FIREBASE_PROJECT_ID = '';
try {
  const cfgPath = path.resolve(ROOT_DIR, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    FIREBASE_PROJECT_ID = parsed.projectId || '';
  }
} catch {
  // Ignore if config absent during build
}

// ============================================================================
// FIREBASE ID TOKEN VERIFIER (RS256 against Google public x509 certs, zero IAM)
// ============================================================================
interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache = { certs: {}, expiresAt: 0 };

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certCache.expiresAt && Object.keys(certCache.certs).length > 0) {
    return certCache.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('Failed to fetch Firebase public signing certificates');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await resp.json()) as Record<string, string>;
  certCache = { certs, expiresAt: now + maxAgeSec * 1000 };
  return certs;
}

interface DecodedFirebaseToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  exp: number;
  aud: string;
  iss: string;
}

async function verifyFirebaseIdToken(idToken: string): Promise<DecodedFirebaseToken> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    exp?: number;
    aud?: string;
    iss?: string;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported JWT algorithm');
  }
  if (!payload.sub || !payload.exp || payload.exp * 1000 <= Date.now()) {
    throw new Error('Token expired or missing subject');
  }
  if (FIREBASE_PROJECT_ID) {
    if (payload.aud !== FIREBASE_PROJECT_ID) {
      throw new Error('Token audience mismatch');
    }
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
      throw new Error('Token issuer mismatch');
    }
  }

  const certs = await getGooglePublicCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error('Unknown signing key ID');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValid = verifier.verify(cert, Buffer.from(sigB64, 'base64url'));
  if (!isValid) throw new Error('Invalid token signature');

  return {
    uid: payload.sub,
    email: payload.email,
    email_verified: Boolean(payload.email_verified),
    exp: payload.exp,
    aud: payload.aud || '',
    iss: payload.iss || '',
  };
}

interface AuthedRequest extends Request {
  user?: DecodedFirebaseToken;
}

async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      req.user = await verifyFirebaseIdToken(token);
    } catch {
      req.user = undefined;
    }
  }
  next();
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  try {
    req.user = await verifyFirebaseIdToken(authHeader.slice(7).trim());
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Invalid or expired authentication token.',
    });
  }
}

// ============================================================================
// SIGNED STREAM TOKEN HELPERS
// ============================================================================
function signStreamPayload(payload: {
  mediaUrl: string;
  uid: string;
  exp: number;
}): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', STREAM_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyStreamToken(token: string): { mediaUrl: string; uid: string; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto
    .createHmac('sha256', STREAM_SECRET)
    .update(encoded)
    .digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      mediaUrl: string;
      uid: string;
      exp: number;
    };
    if (!decoded.exp || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

// ============================================================================
// RESUMABLE UPLOAD SESSION STORE (DISK-BACKED METADATA)
// ============================================================================
interface UploadSession {
  uploadId: string;
  userId: string;
  kind: 'video' | 'image' | 'subtitle';
  originalName: string;
  mimeType: string;
  totalSize: number;
  totalChunks: number;
  receivedChunks: number[];
  ext: string;
  createdAt: number;
}

const uploadSessions = new Map<string, UploadSession>();

const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m3u8']);
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_SUB_EXTS = new Set(['.srt', '.vtt']);

function getGatewayEnvStatus() {
  const khqrMerchantId = (process.env.KHQR_MERCHANT_ID || '').trim();
  const khqrAccountId = (process.env.KHQR_ACCOUNT_ID || '').trim();
  const khqrMerchantName = (process.env.KHQR_MERCHANT_NAME || '').trim();
  const abaMerchantId = (process.env.ABA_PAYWAY_MERCHANT_ID || '').trim();
  const abaApiKey = (process.env.ABA_PAYWAY_API_KEY || '').trim();

  const khqrConfigured = Boolean(khqrMerchantId && khqrAccountId);
  const abaPayWayConfigured = Boolean(abaMerchantId && abaApiKey);

  return {
    khqrConfigured,
    abaPayWayConfigured,
    khqrMerchantName: khqrConfigured ? khqrMerchantName || 'BORINA TV' : null,
    abaMerchantIdMasked: abaPayWayConfigured
      ? `${abaMerchantId.slice(0, 3)}***${abaMerchantId.slice(-2)}`
      : null,
  };
}

function createAbaPayWayHash(reqTime: string, merchantId: string, tranId: string, amount: string, apiKey: string): string {
  const raw = `${reqTime}${merchantId}${tranId}${amount}`;
  return crypto.createHmac('sha512', apiKey).update(raw).digest('base64');
}

function generateOrderRef(prefix: 'KHQR' | 'ABA' | 'MAN'): string {
  const ts = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BTV-${prefix}-${ts}-${rand}`;
}

function serveFileWithRanges(filePath: string, req: Request, res: Response) {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Media file not found.' });
    return;
  }
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.vtt': 'text/vtt; charset=utf-8',
    '.srt': 'text/plain; charset=utf-8',
  };
  const contentType = mimeMap[ext] || 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    if (Number.isNaN(start) || start >= stat.size || end >= stat.size || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
      return;
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'borina-tv-api', timestamp: new Date().toISOString() });
  });

  // ==========================================================================
  // PAYMENT GATEWAY CONFIGURATION & ORDER CREATION (CAMBODIA KHR)
  // ==========================================================================
  app.get('/api/payments/config-status', (_req, res) => {
    res.json(getGatewayEnvStatus());
  });

  app.post('/api/payments/create-order', requireAuth, (req: AuthedRequest, res: Response) => {
    const { plan, method, amountKhr, exchangeRateKhrPerUsd } = req.body as {
      plan?: string;
      method?: string;
      amountKhr?: number;
      exchangeRateKhrPerUsd?: number;
    };

    if (plan !== 'monthly' && plan !== 'yearly') {
      res.status(400).json({ error: 'Invalid subscription plan. Choose monthly or yearly.' });
      return;
    }
    if (method !== 'khqr' && method !== 'aba_payway' && method !== 'manual') {
      res.status(400).json({ error: 'Unsupported payment method.' });
      return;
    }
    const intAmount = Math.round(Number(amountKhr || 0));
    if (!Number.isFinite(intAmount) || intAmount < 1000 || intAmount > 500_000_000) {
      res.status(400).json({ error: 'Invalid KHR payment amount.' });
      return;
    }
    const intRate = Math.round(Number(exchangeRateKhrPerUsd || 4000));
    const envStatus = getGatewayEnvStatus();
    const expiresAtIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    if (method === 'khqr') {
      const orderRef = generateOrderRef('KHQR');
      if (!envStatus.khqrConfigured) {
        res.json({
          orderRef,
          plan,
          method,
          amountKhr: intAmount,
          currency: 'KHR',
          exchangeRateKhrPerUsd: intRate,
          status: 'pending',
          providerConfigured: false,
          setupRequiredReason:
            'KHQR Bakong merchant credentials (KHQR_MERCHANT_ID and KHQR_ACCOUNT_ID) are not yet configured in server environment variables.',
          instructions: [
            'Automated Bakong KHQR generation is awaiting server merchant credentials.',
            'Your order has been created in Pending Payment Verification status — Premium will NOT be activated until payment is officially verified.',
            'To complete payment manually, contact the BORINA TV billing desk with your Order Reference and submit your bank transfer receipt reference below for Admin review.',
          ],
          expiresAtIso,
        });
        return;
      }

      res.json({
        orderRef,
        plan,
        method,
        amountKhr: intAmount,
        currency: 'KHR',
        exchangeRateKhrPerUsd: intRate,
        status: 'pending',
        providerConfigured: true,
        instructions: [
          `Open your Bakong or Cambodian banking app supporting KHQR (ABA, ACLEDA, Wing, Canadia, etc.).`,
          `Enter exact amount ៛${intAmount.toLocaleString('en-US')} KHR with bill reference ${orderRef}.`,
          `Click "Verify Payment Status" after transfer completes so the backend checks official Bakong confirmation.`,
        ],
        expiresAtIso,
        khqrPayload: {
          merchantName: process.env.KHQR_MERCHANT_NAME || 'BORINA TV',
          merchantCity: process.env.KHQR_MERCHANT_CITY || 'Phnom Penh',
          billNumber: orderRef,
          amountKhr: intAmount,
          currencyCode: '116',
        },
      });
      return;
    }

    if (method === 'aba_payway') {
      const orderRef = generateOrderRef('ABA');
      if (!envStatus.abaPayWayConfigured) {
        res.json({
          orderRef,
          plan,
          method,
          amountKhr: intAmount,
          currency: 'KHR',
          exchangeRateKhrPerUsd: intRate,
          status: 'pending',
          providerConfigured: false,
          setupRequiredReason:
            'ABA PayWay merchant credentials (ABA_PAYWAY_MERCHANT_ID and ABA_PAYWAY_API_KEY) are not configured in server environment variables.',
          instructions: [
            'ABA PayWay automated checkout requires server-side Merchant ID and API Key configuration.',
            'Your order is recorded as Pending Payment Verification. Never trust client-side confirmation.',
            'You may submit your ABA Mobile transfer reference below so an Administrator can verify and activate your Premium subscription.',
          ],
          expiresAtIso,
        });
        return;
      }

      const merchantId = (process.env.ABA_PAYWAY_MERCHANT_ID || '').trim();
      const apiKey = (process.env.ABA_PAYWAY_API_KEY || '').trim();
      const endpoint =
        process.env.ABA_PAYWAY_API_URL ||
        'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase';
      const reqTime = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      const amountStr = String(intAmount);
      const hash = createAbaPayWayHash(reqTime, merchantId, orderRef, amountStr, apiKey);

      res.json({
        orderRef,
        plan,
        method,
        amountKhr: intAmount,
        currency: 'KHR',
        exchangeRateKhrPerUsd: intRate,
        status: 'pending',
        providerConfigured: true,
        instructions: [
          'Click "Proceed to ABA PayWay" to complete checkout via ABA Mobile or KHQR.',
          'Once payment completes, BORINA TV verifies the transaction server-side via ABA PayWay Check Transaction API before activating Premium.',
        ],
        expiresAtIso,
        abaCheckoutPayload: {
          endpoint,
          tranId: orderRef,
          reqTime,
          amount: amountStr,
          currency: 'KHR',
          hash,
          merchantId,
        },
      });
      return;
    }

    // Manual verification fallback
    const orderRef = generateOrderRef('MAN');
    res.json({
      orderRef,
      plan,
      method: 'manual',
      amountKhr: intAmount,
      currency: 'KHR',
      exchangeRateKhrPerUsd: intRate,
      status: 'pending',
      providerConfigured: false,
      setupRequiredReason: 'Manual Payment Verification selected.',
      instructions: [
        `Transfer ៛${intAmount.toLocaleString('en-US')} KHR using your Cambodian bank app with memo ${orderRef}.`,
        'Enter your bank transaction / receipt reference number below and submit for Admin verification.',
        'Premium access activates only after an Administrator verifies the transfer.',
      ],
      expiresAtIso,
    });
  });

  // Official server-side payment verification endpoint (NEVER fakes success!)
  app.post('/api/payments/verify', requireAuth, async (req: AuthedRequest, res: Response) => {
    const { orderRef, method } = req.body as { orderRef?: string; method?: string };
    if (!orderRef || typeof orderRef !== 'string') {
      res.status(400).json({ error: 'orderRef is required.' });
      return;
    }

    const envStatus = getGatewayEnvStatus();

    if (method === 'aba_payway' && envStatus.abaPayWayConfigured) {
      try {
        const merchantId = (process.env.ABA_PAYWAY_MERCHANT_ID || '').trim();
        const apiKey = (process.env.ABA_PAYWAY_API_KEY || '').trim();
        const checkUrl =
          process.env.ABA_PAYWAY_CHECK_URL ||
          'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2';
        const reqTime = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
        const hash = crypto
          .createHmac('sha512', apiKey)
          .update(`${reqTime}${merchantId}${orderRef}`)
          .digest('base64');

        const apiResp = await fetch(checkUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ req_time: reqTime, merchant_id: merchantId, tran_id: orderRef, hash }),
        });
        const data = (await apiResp.json()) as { status?: { code?: string }; data?: { payment_status?: string } };
        const isPaid = data?.status?.code === '00' && data?.data?.payment_status === 'APPROVED';

        res.json({
          verified: isPaid,
          status: isPaid ? 'paid' : 'pending',
          providerResponseCode: data?.status?.code || 'UNKNOWN',
          message: isPaid
            ? 'ABA PayWay confirmed payment approval.'
            : 'Transaction has not been confirmed as APPROVED by ABA PayWay yet.',
        });
        return;
      } catch (err) {
        res.status(502).json({
          verified: false,
          status: 'pending',
          message:
            err instanceof Error
              ? `Could not reach ABA PayWay verification API: ${err.message}`
              : 'ABA PayWay verification unavailable.',
        });
        return;
      }
    }

    // Honest pending verification when credentials are unconfigured or KHQR API token missing
    res.json({
      verified: false,
      status: 'pending',
      message:
        'Automated provider confirmation is not configured on this server. Your payment remains Pending until verified by an Administrator in the Admin Dashboard.',
    });
  });

  // Official webhook signature validation endpoints
  app.post('/api/payments/aba-webhook', (req, res) => {
    const secret = (process.env.ABA_PAYWAY_CALLBACK_SECRET || '').trim();
    if (!secret) {
      res.status(503).json({ error: 'ABA webhook secret not configured.' });
      return;
    }
    const sig = String(req.headers['x-payway-signature'] || '');
    const expected = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body || {}))
      .digest('base64');
    if (!sig || sig !== expected) {
      res.status(403).json({ error: 'Invalid webhook signature.' });
      return;
    }
    res.json({ received: true });
  });

  // ==========================================================================
  // RESUMABLE CHUNKED MEDIA UPLOAD API (VIDEOS, POSTERS, COVERS, SUBTITLES)
  // ==========================================================================
  app.post('/api/uploads/init', requireAuth, (req: AuthedRequest, res: Response) => {
    const { filename, mimeType, totalSize, totalChunks, kind } = req.body as {
      filename?: string;
      mimeType?: string;
      totalSize?: number;
      totalChunks?: number;
      kind?: 'video' | 'image' | 'subtitle';
    };

    if (!filename || !totalSize || !totalChunks || !kind) {
      res.status(400).json({ error: 'Missing required upload initialization fields.' });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    if (kind === 'video') {
      if (!ALLOWED_VIDEO_EXTS.has(ext)) {
        res.status(400).json({ error: 'Unsupported video format. Allowed: MP4, WebM, MOV, HLS (.m3u8).' });
        return;
      }
      if (totalSize > 2 * 1024 * 1024 * 1024) {
        res.status(400).json({ error: 'Video exceeds 2 GB limit.' });
        return;
      }
    } else if (kind === 'image') {
      if (!ALLOWED_IMAGE_EXTS.has(ext)) {
        res.status(400).json({ error: 'Unsupported image format. Allowed: JPG, PNG, WebP.' });
        return;
      }
      if (totalSize > 10 * 1024 * 1024) {
        res.status(400).json({ error: 'Image exceeds 10 MB limit.' });
        return;
      }
    } else if (kind === 'subtitle') {
      if (!ALLOWED_SUB_EXTS.has(ext)) {
        res.status(400).json({ error: 'Unsupported subtitle format. Allowed: .srt or .vtt.' });
        return;
      }
      if (totalSize > 2 * 1024 * 1024) {
        res.status(400).json({ error: 'Subtitle file exceeds 2 MB limit.' });
        return;
      }
    } else {
      res.status(400).json({ error: 'Invalid upload kind.' });
      return;
    }

    const uploadId = `upl_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
    const sessionDir = path.join(TMP_DIR, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    uploadSessions.set(uploadId, {
      uploadId,
      userId: req.user!.uid,
      kind,
      originalName: path.basename(filename),
      mimeType: mimeType || 'application/octet-stream',
      totalSize: Number(totalSize),
      totalChunks: Number(totalChunks),
      receivedChunks: [],
      ext,
      createdAt: Date.now(),
    });

    res.json({ uploadId, chunkSize: 1024 * 1024 });
  });

  app.put(
    '/api/uploads/chunk/:uploadId',
    requireAuth,
    express.raw({ type: 'application/octet-stream', limit: '6mb' }),
    (req: AuthedRequest, res: Response) => {
      const uploadId = String(req.params.uploadId);
      const session = uploadSessions.get(uploadId);
      if (!session) {
        res.status(404).json({ error: 'Upload session not found.' });
        return;
      }
      if (session.userId !== req.user!.uid) {
        res.status(403).json({ error: 'Unauthorized upload session access.' });
        return;
      }
      const chunkIndex = Number(req.headers['x-chunk-index']);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
        res.status(400).json({ error: 'Invalid chunk index.' });
        return;
      }
      const bodyBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      const chunkPath = path.join(TMP_DIR, uploadId, `chunk_${String(chunkIndex).padStart(6, '0')}`);
      fs.writeFileSync(chunkPath, bodyBuf);
      if (!session.receivedChunks.includes(chunkIndex)) {
        session.receivedChunks.push(chunkIndex);
      }
      res.json({
        uploadId,
        chunkIndex,
        receivedCount: session.receivedChunks.length,
        totalChunks: session.totalChunks,
      });
    }
  );

  app.post('/api/uploads/complete/:uploadId', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uploadId = String(req.params.uploadId);
    const session = uploadSessions.get(uploadId);
    if (!session) {
      res.status(404).json({ error: 'Upload session not found.' });
      return;
    }
    if (session.userId !== req.user!.uid) {
      res.status(403).json({ error: 'Unauthorized upload completion.' });
      return;
    }
    if (session.receivedChunks.length < session.totalChunks) {
      res.status(400).json({
        error: `Missing chunks: received ${session.receivedChunks.length}/${session.totalChunks}`,
        receivedChunks: session.receivedChunks,
      });
      return;
    }

    const safeFileName = `${session.kind}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${session.ext}`;
    const finalPath = path.join(MEDIA_DIR, safeFileName);
    const writeStream = fs.createWriteStream(finalPath);

    try {
      for (let i = 0; i < session.totalChunks; i += 1) {
        const chunkPath = path.join(TMP_DIR, uploadId, `chunk_${String(i).padStart(6, '0')}`);
        const data = fs.readFileSync(chunkPath);
        writeStream.write(data);
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });
      fs.rmSync(path.join(TMP_DIR, uploadId), { recursive: true, force: true });
      uploadSessions.delete(uploadId);

      res.json({
        url: `/api/media/${safeFileName}`,
        filename: safeFileName,
        kind: session.kind,
        size: session.totalSize,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to assemble uploaded file.',
      });
    }
  });

  app.get('/api/media/:filename', (req, res) => {
    const safeName = path.basename(String(req.params.filename));
    const filePath = path.join(MEDIA_DIR, safeName);
    serveFileWithRanges(filePath, req, res);
  });

  // ==========================================================================
  // SECURE SIGNED STREAMING AUTHORIZATION
  // ==========================================================================
  app.post('/api/stream/authorize', optionalAuth, (req: AuthedRequest, res: Response) => {
    const {
      videoUrl,
      isPremium,
      hasActiveSubscription,
      isOwnerOrAdmin,
    } = req.body as {
      videoUrl?: string;
      isPremium?: boolean;
      hasActiveSubscription?: boolean;
      isOwnerOrAdmin?: boolean;
    };

    if (!videoUrl || typeof videoUrl !== 'string') {
      res.status(400).json({ error: 'Missing videoUrl' });
      return;
    }

    if (isPremium) {
      if (!req.user) {
        res.status(401).json({ allowed: false, reason: 'auth_required', error: 'Sign in required for Premium playback.' });
        return;
      }
      const isBootstrappedAdmin =
        req.user.email === 'ren58791@gmail.com' && req.user.email_verified === true;
      if (!hasActiveSubscription && !isOwnerOrAdmin && !isBootstrappedAdmin) {
        res.status(403).json({
          allowed: false,
          reason: 'premium_required',
          error: 'Active Premium membership is required to stream this episode.',
        });
        return;
      }
    }

    const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2-hour signed URL
    const token = signStreamPayload({
      mediaUrl: videoUrl,
      uid: req.user?.uid || 'visitor',
      exp: expiresAt,
    });

    const signedUrl = videoUrl.startsWith('/api/media/')
      ? `/api/stream/play?token=${encodeURIComponent(token)}`
      : videoUrl;

    res.json({
      allowed: true,
      signedUrl,
      token,
      expiresAt,
    });
  });

  app.get('/api/stream/play', (req, res) => {
    const token = String(req.query.token || '');
    const verified = verifyStreamToken(token);
    if (!verified) {
      res.status(403).json({ error: 'Invalid or expired streaming authorization token.' });
      return;
    }
    if (verified.mediaUrl.startsWith('/api/media/')) {
      const safeName = path.basename(verified.mediaUrl.replace('/api/media/', ''));
      serveFileWithRanges(path.join(MEDIA_DIR, safeName), req, res);
      return;
    }
    res.redirect(verified.mediaUrl);
  });

  // ==========================================================================
  // FRONTEND SERVING (VITE MIDDLEWARE IN DEV, STATIC DIST IN PRODUCTION)
  // ==========================================================================
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.use('/src/assets', express.static(path.resolve(distDir, 'src/assets')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BORINA TV server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start BORINA TV server:', err);
  process.exit(1);
});
