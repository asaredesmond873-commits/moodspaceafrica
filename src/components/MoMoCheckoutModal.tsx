import { useState } from 'react';
import { CheckCircle2, Crown, Phone, ShieldCheck, Smartphone, X, Zap } from 'lucide-react';
import { CHALLENGE_LIMITS, SUBSCRIPTION_PLANS, type ChallengeVideo, type MoMoProvider, type SubscriptionPlanType } from '../types';

export type CheckoutTarget =
  | {
      mode: 'boost';
      video: ChallengeVideo;
    }
  | {
      mode: 'subscription';
      planType: SubscriptionPlanType;
      targetId: string;
      targetName: string;
      targetSubtitle?: string;
    };

interface MoMoCheckoutModalProps {
  target: CheckoutTarget;
  onClose: () => void;
  onConfirm: (provider: MoMoProvider, phone: string) => Promise<void>;
}

const PROVIDERS: {
  id: MoMoProvider;
  short: string;
  regionHint: string;
  activeClass: string;
}[] = [
  {
    id: 'MTN MoMo',
    short: 'MTN MoMo',
    regionHint: 'Ghana, Nigeria, Uganda, Rwanda, Cameroon, Benin, Côte d’Ivoire',
    activeClass: 'border-[#D97706] bg-[#FEF3C7] text-[#92400E]',
  },
  {
    id: 'M-Pesa',
    short: 'M-Pesa',
    regionHint: 'Kenya, Tanzania, Mozambique, DR Congo, Ethiopia',
    activeClass: 'border-[#0E7C5B] bg-[#ECFDF5] text-[#0E7C5B]',
  },
  {
    id: 'Airtel Money',
    short: 'Airtel Money',
    regionHint: 'Kenya, Nigeria, Uganda, Zambia, Tanzania, Rwanda, Malawi',
    activeClass: 'border-[#DC2626] bg-[#FEE2E2] text-[#991B1B]',
  },
  {
    id: 'Telecel Cash',
    short: 'Telecel Cash',
    regionHint: 'Ghana & West Africa',
    activeClass: 'border-[#E11D48] bg-[#FFE4E6] text-[#9F1239]',
  },
  {
    id: 'AirtelTigo Money',
    short: 'AT Money',
    regionHint: 'Ghana',
    activeClass: 'border-[#0284C7] bg-[#E0F2FE] text-[#075985]',
  },
];

export function MoMoCheckoutModal({
  target,
  onClose,
  onConfirm,
}: MoMoCheckoutModalProps) {
  const [provider, setProvider] = useState<MoMoProvider>('MTN MoMo');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isBoost = target.mode === 'boost';
  const amountGhs = isBoost
    ? CHALLENGE_LIMITS.BOOST_COST_GHS
    : target.planType === 'creator_pro'
      ? SUBSCRIPTION_PLANS.CREATOR_PRO_GHS
      : SUBSCRIPTION_PLANS.CREATOR_FAN_GHS;

  const heading = isBoost
    ? 'Boost Story Across Africa'
    : target.planType === 'creator_pro'
      ? 'MoodSpace Creator Pro'
      : `Subscribe to ${target.targetName}`;

  const subheading = isBoost
    ? 'Reach more viewers for 24 hours · Supports selection'
    : target.planType === 'creator_pro'
      ? 'Monthly creator membership · 30 days'
      : 'Monthly fan subscription · 30 days';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 13) {
      setError('Enter a valid African mobile money number (e.g. +254 712 345 678 or 024 123 4567).');
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(provider, digits);
      setSuccess(true);
      window.setTimeout(() => {
        onClose();
      }, 1300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment could not be completed.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="momo-modal-title"
    >
      <div className="w-full sm:max-w-md bg-white border border-[#E7E5E0] rounded-t-2xl sm:rounded-2xl text-[#141413] overflow-hidden shadow-2xl max-h-[92dvh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-[#E7E5E0] flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[#0E7C5B] shrink-0">
              {isBoost ? <Zap className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h2 id="momo-modal-title" className="font-display text-base font-bold text-[#141413] truncate">
                {heading}
              </h2>
              <p className="text-xs text-[#5E5D59] truncate">{subheading}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mobile money checkout"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-[#5E5D59] hover:text-[#141413] hover:bg-[#FAF9F7] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#0E7C5B] mx-auto" />
            <h3 className="font-display text-lg font-bold text-[#141413]">
              {isBoost ? 'Story Boosted for 24h' : 'Subscription Activated'}
            </h3>
            <p className="text-sm text-[#5E5D59]">
              {isBoost
                ? `"${target.video.title}" is now promoted across MoodSpace Africa.`
                : target.planType === 'creator_pro'
                  ? 'Your Creator Pro badge and perks are active for 30 days.'
                  : `You are now supporting ${target.targetName} monthly.`}
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
            <div className="bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-[#5E5D59]">
                  {isBoost ? 'African Story Entry' : target.planType === 'creator_pro' ? 'Creator Pro Plan' : 'Creator Fan Pass'}
                </p>
                <p className="text-sm font-semibold text-[#141413] truncate">
                  {isBoost ? target.video.title : target.targetName}
                </p>
                <p className="text-xs text-[#5E5D59] truncate">
                  {isBoost
                    ? `by ${target.video.authorName}`
                    : target.targetSubtitle || 'Includes monthly creator support & supporter badge'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-[#5E5D59]">{isBoost ? '24h Boost' : 'Monthly'}</p>
                <p className="font-display text-lg font-bold text-[#0E7C5B] tabular-nums">
                  {amountGhs} GHS
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#141413]">
                African Mobile Money Network
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROVIDERS.map((item) => {
                  const selected = provider === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setProvider(item.id)}
                      className={`min-h-[46px] px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                        selected
                          ? item.activeClass
                          : 'border-[#E7E5E0] bg-white text-[#5E5D59] hover:border-[#D4D1CA] hover:text-[#141413]'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{item.short}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-[#5E5D59]">
                Available in: {PROVIDERS.find((p) => p.id === provider)?.regionHint}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="momo-phone" className="block text-xs font-semibold text-[#141413]">
                Mobile Money Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#5E5D59] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="momo-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+254 712 345 678 / 024 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 bg-white border border-[#E7E5E0] rounded-xl text-base sm:text-sm text-[#141413] placeholder-[#9E9A93] focus:outline-none focus:border-[#0E7C5B]"
                  required
                />
              </div>
            </div>

            {error && (
              <p className="text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 text-[11px] text-[#5E5D59]">
              <ShieldCheck className="w-4 h-4 text-[#0E7C5B] shrink-0" />
              <span>
                Confirm the {amountGhs} GHS {provider} prompt on your phone to complete.
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
                className="flex-[1.5] min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-xl hover:bg-[#095E44] disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Confirming...'
                  : isBoost
                    ? `Pay ${amountGhs} GHS & Boost`
                    : `Subscribe · ${amountGhs} GHS/mo`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
