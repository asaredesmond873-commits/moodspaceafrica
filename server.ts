import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPaystackSecretKey(): string {
  return (process.env.PAYSTACK_SECRET_KEY || '').trim();
}

const USD_MONTHLY_PRICE = 10;
const SUPPORTED_CURRENCIES = ['GHS', 'NGN', 'KES', 'ZAR', 'USD'] as const;
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const FALLBACK_RATES: Record<SupportedCurrency, number> = {
  GHS: 15.5,
  NGN: 1600,
  KES: 130,
  ZAR: 18.5,
  USD: 1,
};

let cachedRates: {
  rates: Record<SupportedCurrency, number>;
  fetchedAt: number;
  source: 'live' | 'fallback';
} | null = null;

async function getUsdExchangeRates(): Promise<{
  rates: Record<SupportedCurrency, number>;
  source: 'live' | 'fallback';
  fetchedAt: number;
}> {
  const now = Date.now();
  if (cachedRates && now - cachedRates.fetchedAt < 15 * 60 * 1000) {
    return cachedRates;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const json = (await response.json()) as {
        result?: string;
        rates?: Record<string, number>;
      };
      if (json.rates) {
        const nextRates: Record<SupportedCurrency, number> = {
          GHS: Number(json.rates.GHS) > 0 ? Number(json.rates.GHS) : FALLBACK_RATES.GHS,
          NGN: Number(json.rates.NGN) > 0 ? Number(json.rates.NGN) : FALLBACK_RATES.NGN,
          KES: Number(json.rates.KES) > 0 ? Number(json.rates.KES) : FALLBACK_RATES.KES,
          ZAR: Number(json.rates.ZAR) > 0 ? Number(json.rates.ZAR) : FALLBACK_RATES.ZAR,
          USD: 1,
        };
        cachedRates = { rates: nextRates, fetchedAt: now, source: 'live' };
        return cachedRates;
      }
    }
  } catch {
    // Use fallback rates when offline or rate-limited
  }

  cachedRates = {
    rates: { ...FALLBACK_RATES },
    fetchedAt: now,
    source: 'fallback',
  };
  return cachedRates;
}

function computeLocalMonthlyPrice(currency: SupportedCurrency, rate: number): number {
  const raw = USD_MONTHLY_PRICE * rate;
  if (currency === 'NGN' || currency === 'KES') {
    return Math.round(raw);
  }
  return Math.round(raw * 100) / 100;
}

function isSupportedCurrency(val: unknown): val is SupportedCurrency {
  return typeof val === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(val);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/paystack/config', (_req, res) => {
    res.json({
      usdAmount: USD_MONTHLY_PRICE,
      publicKey: (process.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim(),
      liveConfigured: Boolean(getPaystackSecretKey()),
    });
  });

  app.get('/api/paystack/rates', async (_req, res) => {
    const { rates, source, fetchedAt } = await getUsdExchangeRates();
    const localPrices: Record<SupportedCurrency, number> = {
      GHS: computeLocalMonthlyPrice('GHS', rates.GHS),
      NGN: computeLocalMonthlyPrice('NGN', rates.NGN),
      KES: computeLocalMonthlyPrice('KES', rates.KES),
      ZAR: computeLocalMonthlyPrice('ZAR', rates.ZAR),
      USD: USD_MONTHLY_PRICE,
    };

    res.json({
      usdAmount: USD_MONTHLY_PRICE,
      rates,
      localPrices,
      source,
      fetchedAt,
      liveConfigured: Boolean(getPaystackSecretKey()),
    });
  });

  app.post('/api/paystack/initialize', async (req, res) => {
    const body = (req.body || {}) as {
      email?: unknown;
      currency?: unknown;
      country?: unknown;
      uid?: unknown;
    };

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const country = typeof body.country === 'string' ? body.country.trim().slice(0, 80) : 'Africa';
    const uid = typeof body.uid === 'string' ? body.uid.trim().slice(0, 128) : '';

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'A valid email address is required for Paystack checkout.' });
      return;
    }

    if (!isSupportedCurrency(body.currency)) {
      res.status(400).json({ error: 'Unsupported Paystack currency selected.' });
      return;
    }

    const currency = body.currency;
    const { rates } = await getUsdExchangeRates();
    const localAmount = computeLocalMonthlyPrice(currency, rates[currency]);
    const amountSubunits = Math.round(localAmount * 100);
    const paystackSecret = getPaystackSecretKey();
    const publicKey = (process.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim();

    if (!paystackSecret) {
      const previewRef = `msp_preview_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      res.json({
        mode: 'preview',
        reference: previewRef,
        currency,
        localAmount,
        usdAmount: USD_MONTHLY_PRICE,
        publicKey,
      });
      return;
    }

    const reference = `msp_pass_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    try {
      const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: amountSubunits,
          currency,
          reference,
          metadata: {
            uid,
            country,
            plan: 'creator_pass',
            usdAmount: USD_MONTHLY_PRICE,
          },
        }),
      });

      const payload = (await paystackRes.json()) as {
        status?: boolean;
        message?: string;
        data?: {
          authorization_url?: string;
          access_code?: string;
          reference?: string;
        };
      };

      if (!paystackRes.ok || !payload.status || !payload.data) {
        res.status(400).json({
          error: payload.message || 'Unable to initialize Paystack transaction.',
        });
        return;
      }

      res.json({
        mode: 'live',
        reference: payload.data.reference || reference,
        accessCode: payload.data.access_code || '',
        authorizationUrl: payload.data.authorization_url || '',
        currency,
        localAmount,
        usdAmount: USD_MONTHLY_PRICE,
        publicKey,
      });
    } catch {
      res.status(502).json({ error: 'Could not reach Paystack right now. Please try again.' });
    }
  });

  app.post('/api/paystack/verify', async (req, res) => {
    const body = (req.body || {}) as { reference?: unknown };
    const reference = typeof body.reference === 'string' ? body.reference.trim() : '';

    if (!reference || reference.length < 6 || reference.length > 120) {
      res.status(400).json({ error: 'Invalid Paystack transaction reference.' });
      return;
    }

    const paystackSecret = getPaystackSecretKey();
    if (!paystackSecret) {
      if (!reference.startsWith('msp_preview_')) {
        res.status(400).json({ error: 'Invalid preview transaction reference.' });
        return;
      }
      res.json({
        verified: true,
        mode: 'preview',
        reference,
      });
      return;
    }

    try {
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
          },
        }
      );

      const payload = (await verifyRes.json()) as {
        status?: boolean;
        message?: string;
        data?: {
          status?: string;
          reference?: string;
          currency?: string;
          amount?: number;
        };
      };

      if (!verifyRes.ok || !payload.status || !payload.data) {
        res.status(400).json({
          error: payload.message || 'Paystack transaction verification failed.',
        });
        return;
      }

      if (payload.data.status !== 'success') {
        res.status(402).json({
          error: `Payment status is "${payload.data.status || 'incomplete'}". Complete payment in Paystack first.`,
        });
        return;
      }

      res.json({
        verified: true,
        mode: 'live',
        reference: payload.data.reference || reference,
        currency: payload.data.currency,
        localAmount: typeof payload.data.amount === 'number' ? payload.data.amount / 100 : undefined,
      });
    } catch {
      res.status(502).json({ error: 'Could not verify Paystack transaction.' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MoodSpace Africa server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
