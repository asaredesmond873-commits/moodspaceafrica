import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Eye,
  Globe2,
  Lock,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  AFRICAN_PAYSTACK_COUNTRIES,
  CURRENCY_SYMBOLS,
  SUBSCRIPTION_PLANS,
  type PaystackCurrency,
} from '../types';
import {
  detectPaystackCountryFromLocation,
  formatLocalCurrencyPrice,
} from '../utils/challengeMedia';

interface PaystackCheckoutModalProps {
  onClose: () => void;
  onConfirm: (input: {
    country: string;
    currency: PaystackCurrency;
    localAmount: number;
    paystackReference: string;
  }) => Promise<void>;
}

interface RatesPayload {
  usdAmount: number;
  localPrices: Record<PaystackCurrency, number>;
  source: 'live' | 'fallback';
  liveConfigured: boolean;
}

const DEFAULT_LOCAL_PRICES: Record<PaystackCurrency, number> = {
  GHS: 155,
  NGN: 16000,
  KES: 1300,
  ZAR: 185,
  USD: 10,
};

interface PaystackPopInstance {
  resumeTransaction: (
    accessCode: string,
    callbacks?: {
      onSuccess?: (trx: { reference?: string }) => void;
      onCancel?: () => void;
      onError?: (err: { message?: string }) => void;
    }
  ) => void;
}

function loadPaystackInlineScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const w = window as unknown as { PaystackPop?: new () => PaystackPopInstance };
  if (w.PaystackPop) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-paystack-inline="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v2/inline.js';
    script.async = true;
    script.dataset.paystackInline = 'true';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export function PaystackCheckoutModal({
  onClose,
  onConfirm,
}: PaystackCheckoutModalProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [selectedCountry, setSelectedCountry] = useState<string>(() =>
    detectPaystackCountryFromLocation(profile?.location || '')
  );
  const [rates, setRates] = useState<RatesPayload>({
    usdAmount: SUBSCRIPTION_PLANS.USD_MONTHLY,
    localPrices: DEFAULT_LOCAL_PRICES,
    source: 'fallback',
    liveConfigured: false,
  });
  const [ratesLoading, setRatesLoading] = useState(true);
  const [emailInput, setEmailInput] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user?.email && !emailInput) {
      setEmailInput(user.email);
    }
  }, [user?.email, emailInput]);

  useEffect(() => {
    let active = true;
    fetch('/api/paystack/rates')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RatesPayload | null) => {
        if (active && data?.localPrices) {
          setRates(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRatesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const countryMeta = useMemo(() => {
    return (
      AFRICAN_PAYSTACK_COUNTRIES.find((c) => c.country === selectedCountry) ||
      AFRICAN_PAYSTACK_COUNTRIES[0]
    );
  }, [selectedCountry]);

  const localAmount = rates.localPrices[countryMeta.currency] ?? DEFAULT_LOCAL_PRICES[countryMeta.currency];
  const formattedLocalPrice = formatLocalCurrencyPrice(
    localAmount,
    CURRENCY_SYMBOLS[countryMeta.currency],
    countryMeta.currency
  );

  const finalizeVerification = async (reference: string) => {
    const verifyRes = await fetch('/api/paystack/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    });
    const verifyJson = (await verifyRes.json()) as { verified?: boolean; error?: string };
    if (!verifyRes.ok || !verifyJson.verified) {
      throw new Error(verifyJson.error || 'Could not verify Paystack payment yet.');
    }

    await onConfirm({
      country: countryMeta.country,
      currency: countryMeta.currency,
      localAmount,
      paystackReference: reference,
    });
    setSuccess(true);
    window.setTimeout(() => {
      onClose();
    }, 1400);
  };

  const handleStartPaystack = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let activeUid = user?.uid;
    let activeEmail = emailInput.trim() || user?.email || '';
    if (!user) {
      const signed = await signInWithGoogle();
      if (!signed) return;
      activeUid = signed.uid;
      if (!activeEmail) activeEmail = `${signed.uid}@moodspace.africa`;
    }

    if (!activeEmail || !activeEmail.includes('@')) {
      setError('Enter a valid email address for your Paystack receipt.');
      return;
    }

    setSubmitting(true);
    try {
      const initRes = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: activeEmail,
          currency: countryMeta.currency,
          country: countryMeta.country,
          uid: activeUid || '',
        }),
      });
      const initData = (await initRes.json()) as {
        mode?: 'live' | 'preview';
        reference?: string;
        accessCode?: string;
        authorizationUrl?: string;
        error?: string;
      };

      if (!initRes.ok || !initData.reference) {
        throw new Error(initData.error || 'Could not initialize Paystack checkout.');
      }

      if (initData.mode === 'preview') {
        await finalizeVerification(initData.reference);
        return;
      }

      if (initData.accessCode) {
        const scriptReady = await loadPaystackInlineScript();
        const w = window as unknown as { PaystackPop?: new () => PaystackPopInstance };
        if (scriptReady && w.PaystackPop) {
          const popup = new w.PaystackPop();
          popup.resumeTransaction(initData.accessCode, {
            onSuccess: (trx) => {
              const ref = trx.reference || initData.reference!;
              void finalizeVerification(ref).catch((err) => {
                setError(err instanceof Error ? err.message : 'Verification failed.');
                setSubmitting(false);
              });
            },
            onCancel: () => {
              setError('Paystack payment was cancelled.');
              setSubmitting(false);
            },
            onError: (err) => {
              setError(err.message || 'Paystack checkout encountered an error.');
              setSubmitting(false);
            },
          });
          return;
        }
      }

      if (initData.authorizationUrl) {
        setPendingAuthUrl(initData.authorizationUrl);
        setPendingRef(initData.reference);
        setSubmitting(false);
        return;
      }

      throw new Error('Paystack checkout session could not be opened.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment could not be completed.');
      setSubmitting(false);
    }
  };

  const handleVerifyPending = async () => {
    if (!pendingRef) return;
    setError(null);
    setSubmitting(true);
    try {
      await finalizeVerification(pendingRef);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment not completed yet.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paystack-modal-title"
    >
      <div className="w-full sm:max-w-md bg-white border border-[#E7E5E0] rounded-t-2xl sm:rounded-2xl text-[#141413] overflow-hidden shadow-2xl max-h-[92dvh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-[#E7E5E0] flex items-center justify-between">
          <div className="min-w-0">
            <h2 id="paystack-modal-title" className="font-display text-base font-bold text-[#141413]">
              Subscribe · MoodSpace Creator Pass
            </h2>
            <p className="text-xs text-[#5E5D59]">
              $10 / month · Powered by Paystack across Africa
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close subscription checkout"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-[#5E5D59] hover:text-[#141413] hover:bg-[#FAF9F7] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#0E7C5B] mx-auto" />
            <h3 className="font-display text-lg font-bold text-[#141413]">
              Creator Pass Active
            </h3>
            <p className="text-sm text-[#5E5D59]">
              You can now upload story videos to enter the prize round, carry your Verified Creator badge, and see who viewed your profile.
            </p>
          </div>
        ) : pendingAuthUrl ? (
          <div className="p-5 space-y-4">
            <div className="bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl p-4 space-y-2 text-xs text-[#5E5D59]">
              <p className="font-bold text-[#141413]">Complete Payment in Paystack</p>
              <p>
                Open the Paystack checkout page below to pay{' '}
                <span className="font-semibold text-[#141413]">
                  {formattedLocalPrice} ({countryMeta.currency})
                </span>
                , then return here and click Verify Payment.
              </p>
              <a
                href={pendingAuthUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#141413] text-white text-xs font-semibold hover:bg-[#272725]"
              >
                Continue to Paystack Checkout
              </a>
            </div>

            {error && (
              <p className="text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPendingAuthUrl(null);
                  setPendingRef(null);
                }}
                className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-[#5E5D59] bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleVerifyPending()}
                className="flex-[1.5] min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-xl hover:bg-[#095E44] disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Verifying...' : 'Verify Payment'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleStartPaystack(e)} className="p-5 space-y-4">
            {/* Single Plan Summary Box */}
            <div className="bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#0E7C5B]">Monthly Membership</p>
                  <p className="font-display text-lg font-bold text-[#141413]">
                    $10 USD / month
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-[#5E5D59]">
                    {ratesLoading ? 'Converting...' : `Converted (${countryMeta.currency})`}
                  </p>
                  <p className="font-display text-lg font-bold text-[#0E7C5B] tabular-nums">
                    {formattedLocalPrice}
                  </p>
                </div>
              </div>

              <ul className="space-y-2 pt-2 border-t border-[#E7E5E0] text-xs text-[#353431]">
                <li className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#0E7C5B] shrink-0" />
                  <span>Post story videos to enter and win round prizes</span>
                </li>
                <li className="flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-[#0E7C5B] shrink-0" />
                  <span>Verified Creator badge on your profile &amp; videos</span>
                </li>
                <li className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#0E7C5B] shrink-0" />
                  <span>See everyone who viewed your profile</span>
                </li>
              </ul>
            </div>

            {/* Country & Auto Currency Selector */}
            <div className="space-y-1.5">
              <label htmlFor="paystack-country" className="block text-xs font-semibold text-[#141413]">
                African Country &amp; Local Currency
              </label>
              <div className="relative">
                <Globe2 className="w-4 h-4 text-[#0E7C5B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  id="paystack-country"
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
                >
                  {AFRICAN_PAYSTACK_COUNTRIES.map((item) => (
                    <option key={item.country} value={item.country}>
                      {item.country} ({item.currency})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-[#5E5D59]">
                Auto-converts $10 USD to Ghana (GHS), Nigeria (NGN), Kenya (KES), South Africa (ZAR), or USD across Africa.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="paystack-email" className="block text-xs font-semibold text-[#141413]">
                Paystack Receipt Email
              </label>
              <input
                id="paystack-email"
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] placeholder-[#9E9A93] focus:outline-none focus:border-[#0E7C5B]"
              />
            </div>

            {error && (
              <p className="text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-start gap-2 text-[11px] text-[#5E5D59]">
              <ShieldCheck className="w-4 h-4 text-[#0E7C5B] shrink-0 mt-0.5" />
              <span>
                {rates.liveConfigured
                  ? 'Secured by Paystack. Supports Card, Mobile Money, Bank Transfer & USSD.'
                  : 'Paystack preview mode active — add PAYSTACK_SECRET_KEY in Secrets to enable live charges.'}
              </span>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-[#5E5D59] bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl hover:text-[#141413] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-[1.6] min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-xl hover:bg-[#095E44] disabled:opacity-60 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>
                  {submitting
                    ? 'Connecting Paystack...'
                    : `Subscribe · ${formattedLocalPrice}/mo`}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
