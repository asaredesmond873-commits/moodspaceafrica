import { useAuth } from '../context/AuthContext';

export type NavSection = 'discover' | 'events' | 'promos' | 'dashboard';

interface TopBarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onOpenComposer: () => void;
}

export function TopBar({ activeSection, onSelectSection, onOpenComposer }: TopBarProps) {
  const { user, authBusy, signInWithGoogle } = useAuth();

  const navItems: { id: NavSection; label: string }[] = [
    { id: 'discover', label: 'Discover' },
    { id: 'events', label: 'Events' },
    { id: 'promos', label: 'Promos' },
    { id: 'dashboard', label: 'Dashboard' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#FAF9F7]/95 backdrop-blur-sm border-b border-[#E7E5E0]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectSection('discover')}
          className="font-display text-xl font-bold tracking-tight text-[#141413] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7C5B] rounded"
        >
          MoodSpace Africa
        </button>

        {/* Zone 2: 4 Clean Single-Line Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7C5B] ${
                  isActive
                    ? 'border-[#0E7C5B] text-[#141413] font-semibold'
                    : 'border-transparent text-[#5E5D59] hover:text-[#141413] hover:border-[#D4D1CA]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={onOpenComposer}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0E7C5B]"
            >
              Create Post
            </button>
          ) : (
            <button
              type="button"
              disabled={authBusy}
              onClick={() => void signInWithGoogle()}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0E7C5B]"
            >
              {authBusy ? 'Signing In...' : 'Sign In'}
            </button>
          )}
        </div>
      </div>

      {/* Mobile secondary nav row (only < md) */}
      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden items-center justify-around border-t border-[#E7E5E0] px-2 py-1.5 bg-[#FAF9F7]"
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                isActive ? 'bg-[#141413] text-white' : 'text-[#5E5D59] hover:text-[#141413]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
