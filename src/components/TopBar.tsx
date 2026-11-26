import { Bell, Home, LayoutGrid, User, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type NavSection = 'home' | 'following' | 'notifications' | 'dashboard';

interface TopBarProps {
  activeSection: NavSection;
  unreadNotificationsCount?: number;
  onSelectSection: (section: NavSection) => void;
  onOpenVideoUpload: () => void;
  onOpenMyProfile: () => void;
}

export function TopBar({
  activeSection,
  unreadNotificationsCount = 0,
  onSelectSection,
  onOpenVideoUpload,
  onOpenMyProfile,
}: TopBarProps) {
  const { user, profile, authBusy, signInWithGoogle } = useAuth();

  const navItems: {
    id: NavSection;
    label: string;
    Icon: typeof Home;
  }[] = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'following', label: 'Following', Icon: Users },
    { id: 'notifications', label: 'Notifications', Icon: Bell },
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutGrid },
  ];

  const resolvedNav = activeSection;

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#FAF9F7]/95 backdrop-blur-sm border-b border-[#E7E5E0]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onSelectSection('home')}
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#141413] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7C5B] rounded"
          >
            MoodSpace Africa
          </button>

          {/* Zone 2: Clean 4-Tab Primary Navigation (Desktop) */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map(({ id, label, Icon }) => {
              const isActive = resolvedNav === id;
              const showUnread = id === 'notifications' && unreadNotificationsCount > 0;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectSection(id)}
                  className={`py-1.5 border-b-2 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7C5B] ${
                    isActive
                      ? 'border-[#0E7C5B] text-[#141413] font-semibold'
                      : 'border-transparent text-[#5E5D59] hover:text-[#141413] hover:border-[#D4D1CA]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                  {showUnread && (
                    <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold leading-none rounded bg-[#0E7C5B] text-white tabular-nums">
                      {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Profile */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={onOpenVideoUpload}
                  className="min-h-[38px] px-4 py-1.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0E7C5B]"
                >
                  Upload Story
                </button>
                <button
                  type="button"
                  onClick={onOpenMyProfile}
                  aria-label="Open your profile"
                  title="Profile"
                  className="w-9 h-9 rounded-full border border-[#E7E5E0] bg-white flex items-center justify-center overflow-hidden hover:border-[#0E7C5B] transition-colors cursor-pointer shrink-0"
                >
                  {profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-4 h-4 text-[#141413]" />
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void signInWithGoogle()}
                className="min-h-[38px] px-4 py-1.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0E7C5B]"
              >
                {authBusy ? 'Signing In...' : 'Sign In'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Friendly TikTok-Style Bottom Navigation Bar on Mobile (< md) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#FAF9F7]/95 backdrop-blur-sm border-t border-[#E7E5E0] px-2 py-1 grid grid-cols-4 gap-1"
      >
        {navItems.map(({ id, label, Icon }) => {
          const isActive = resolvedNav === id;
          const showUnread = id === 'notifications' && unreadNotificationsCount > 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectSection(id)}
              className={`relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                isActive ? 'text-[#0E7C5B] font-semibold' : 'text-[#5E5D59] hover:text-[#141413]'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {showUnread && (
                  <span className="absolute -top-1.5 -right-2 px-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#0E7C5B] text-white text-[9px] font-bold tabular-nums">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </div>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
