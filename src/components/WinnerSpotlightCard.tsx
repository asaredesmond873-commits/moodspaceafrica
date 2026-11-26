import { useEffect, useRef, useState } from 'react';
import { Award, MapPin, PartyPopper, Pause, Play, Trophy } from 'lucide-react';
import { loadChallengeVideoChunks } from '../services/challengeService';
import type { ChallengeConfig, ChallengeVideo } from '../types';
import { computeCreatorSupportScore, loadCachedOrRemoteVideoUrl } from '../utils/challengeMedia';

interface WinnerSpotlightCardProps {
  config: ChallengeConfig;
  roundVideos: ChallengeVideo[];
  isAdmin: boolean;
  dataSaver: boolean;
  onSelectWinner: (video: ChallengeVideo) => Promise<void>;
}

const CONFETTI_PIECES = [
  { left: '8%', delay: '0s', color: '#0E7C5B' },
  { left: '18%', delay: '0.4s', color: '#D97706' },
  { left: '29%', delay: '0.9s', color: '#2563EB' },
  { left: '41%', delay: '0.2s', color: '#F59E0B' },
  { left: '53%', delay: '1.1s', color: '#10B981' },
  { left: '66%', delay: '0.6s', color: '#EF4444' },
  { left: '78%', delay: '0.3s', color: '#D97706' },
  { left: '90%', delay: '0.8s', color: '#0E7C5B' },
];

export function WinnerSpotlightCard({
  config,
  roundVideos,
  isAdmin,
  dataSaver,
  onSelectWinner,
}: WinnerSpotlightCardProps) {
  const [confettiOn, setConfettiOn] = useState(true);
  const [winnerVideoUrl, setWinnerVideoUrl] = useState<string>('');
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [reelPlaying, setReelPlaying] = useState(true);
  const [pickingWinner, setPickingWinner] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;
    setWinnerVideoUrl('');
    if (!config.winnerVideoId || dataSaver) return;

    const matchingVideo = roundVideos.find((v) => v.id === config.winnerVideoId);
    const mimeType = matchingVideo?.mimeType || 'video/mp4';

    setLoadingVideo(true);
    loadCachedOrRemoteVideoUrl(config.winnerVideoId, mimeType, loadChallengeVideoChunks)
      .then((url) => {
        if (active) setWinnerVideoUrl(url);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingVideo(false);
      });

    return () => {
      active = false;
    };
  }, [config.winnerVideoId, dataSaver, roundVideos]);

  // Canvas fallback visual when no remote video clip is linked yet
  useEffect(() => {
    if (winnerVideoUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;

    const drawFrame = () => {
      const w = canvas.width;
      const h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#0F172A');
      grad.addColorStop(0.6, '#064E3B');
      grad.addColorStop(1, '#111827');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h * 0.43;
      for (let ring = 0; ring < 3; ring += 1) {
        const radius = 26 + ring * 14 + Math.sin(phase * 1.5 + ring) * 4;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle =
          ring === 1 ? 'rgba(251, 191, 36, 0.5)' : 'rgba(16, 185, 129, 0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = '#FBBF24';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PREVIOUS WINNER', cx, h * 0.72);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(config.winnerName || 'Ama Serwaa', cx, h * 0.82);

      ctx.fillStyle = '#A7F3D0';
      ctx.font = '600 11px sans-serif';
      ctx.fillText('Round Champion', cx, h * 0.91);

      if (reelPlaying) {
        phase += 0.04;
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [winnerVideoUrl, reelPlaying, config.winnerName]);

  const handleLoadWinnerVideo = async () => {
    if (!config.winnerVideoId || loadingVideo) return;
    const matchingVideo = roundVideos.find((v) => v.id === config.winnerVideoId);
    setLoadingVideo(true);
    try {
      const url = await loadCachedOrRemoteVideoUrl(
        config.winnerVideoId,
        matchingVideo?.mimeType || 'video/mp4',
        loadChallengeVideoChunks
      );
      setWinnerVideoUrl(url);
    } finally {
      setLoadingVideo(false);
    }
  };

  const sortedBySupport = [...roundVideos].sort(
    (a, b) => computeCreatorSupportScore(b) - computeCreatorSupportScore(a)
  );

  return (
    <section
      aria-label="Previous round winner"
      className="relative overflow-hidden bg-white border border-[#E7E5E0] rounded-2xl p-4 sm:p-5"
    >
      {confettiOn && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {CONFETTI_PIECES.map((piece, idx) => (
            <span
              key={idx}
              className="animate-confetti-fall absolute top-0 w-2 h-2.5 rounded-xs"
              style={{
                left: piece.left,
                animationDelay: piece.delay,
                backgroundColor: piece.color,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 flex flex-col sm:flex-row gap-4 items-stretch">
        <div className="relative w-full sm:w-36 aspect-[9/12] sm:aspect-[3/4] rounded-xl overflow-hidden bg-[#111827] border border-[#E7E5E0] shrink-0">
          {winnerVideoUrl ? (
            <video
              src={winnerVideoUrl}
              poster={config.winnerThumbnailUrl || undefined}
              controls
              playsInline
              muted
              loop
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="relative w-full h-full">
              {config.winnerThumbnailUrl ? (
                <img
                  src={config.winnerThumbnailUrl}
                  alt={config.winnerTitle}
                  className="w-full h-full object-cover"
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  width={220}
                  height={290}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 to-transparent flex items-center justify-between">
                {config.winnerVideoId ? (
                  <button
                    type="button"
                    onClick={() => void handleLoadWinnerVideo()}
                    className="w-full min-h-[36px] px-2.5 py-1 text-xs font-semibold text-white bg-[#0E7C5B] rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {loadingVideo ? 'Loading...' : 'Watch Story'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReelPlaying((p) => !p)}
                    aria-label={reelPlaying ? 'Pause winner highlight' : 'Play winner highlight'}
                    className="w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center border border-white/25 cursor-pointer"
                  >
                    {reelPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col justify-between min-w-0 space-y-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#D97706]">
                <Trophy className="w-4 h-4 shrink-0" />
                <span>Previous Winner · {config.winnerRoundLabel || 'Last Round'}</span>
              </div>
              <button
                type="button"
                onClick={() => setConfettiOn((prev) => !prev)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#E7E5E0] bg-[#FAF9F7] text-[11px] font-medium text-[#5E5D59] hover:text-[#141413] flex items-center gap-1 cursor-pointer"
              >
                <PartyPopper className="w-3.5 h-3.5 text-[#D97706]" />
                {confettiOn ? 'Confetti On' : 'Celebrate'}
              </button>
            </div>

            <div>
              <h3 className="font-display text-base sm:text-lg font-bold text-[#141413] leading-snug">
                {config.winnerName || 'Ama Serwaa'}
              </h3>
              <p className="text-xs text-[#5E5D59] flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-[#0E7C5B]" />
                <span>{config.winnerLocation || 'Africa'}</span>
              </p>
            </div>

            <p className="text-xs sm:text-sm text-[#3F3E3B] line-clamp-2">
              "{config.winnerTitle || 'Voices Along the Coast — Pan-African Rhythm'}"
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E7E5E0]">
            <div className="flex items-center gap-2 text-xs">
              <Award className="w-4 h-4 text-[#0E7C5B]" />
              <span className="font-semibold text-[#0E7C5B]">Round Champion Award</span>
            </div>

            {isAdmin && sortedBySupport.length > 0 && (
              <button
                type="button"
                onClick={() => setPickingWinner((v) => !v)}
                className="min-h-[36px] px-3 py-1 text-xs font-semibold text-[#0E7C5B] bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg hover:bg-[#D1FAE5] cursor-pointer"
              >
                {pickingWinner ? 'Hide Picker' : 'Pick Winner'}
              </button>
            )}
          </div>

          {isAdmin && pickingWinner && sortedBySupport.length > 0 && (
            <div className="bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl p-2.5 space-y-1.5 max-h-44 overflow-y-auto">
              <p className="text-[11px] font-semibold text-[#5E5D59]">
                Ranked by support, gifts &amp; boosts:
              </p>
              {sortedBySupport.slice(0, 10).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setPickingWinner(false);
                    void onSelectWinner(v);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white border border-transparent hover:border-[#E7E5E0] text-xs flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="truncate text-[#141413] font-medium">
                    {v.authorName} — {v.title}
                  </span>
                  <span className="text-[#0E7C5B] font-semibold tabular-nums shrink-0">
                    {v.votesCount}v · {v.giftsCount} gifts{v.boostedUntil > Date.now() ? ' · Boosted' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
