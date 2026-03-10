import { useState } from 'react';

interface AhoyLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon' | 'wordmark';
  className?: string;
  animated?: boolean;
}

export function AhoyLogo({
  size = 'md',
  variant = 'full',
  className = '',
  animated = false
}: AhoyLogoProps) {
  const [isHovered, setIsHovered] = useState(false);

  const sizes = {
    sm: { icon: 32, text: 'text-lg', spacing: 'gap-2' },
    md: { icon: 40, text: 'text-xl', spacing: 'gap-2.5' },
    lg: { icon: 56, text: 'text-3xl', spacing: 'gap-3' },
    xl: { icon: 72, text: 'text-4xl', spacing: 'gap-4' },
  };

  const { icon: iconSize, text: textSize, spacing } = sizes[size];

  // AHOY institutional gold color palette
  const goldPrimary = '#F8B032';
  const goldSecondary = '#E8A633';
  const goldDark = '#D69A31';

  // SVG Logo Icon - Stylized 'A' with anchor/maritime theme
  const LogoIcon = () => (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-transform duration-500 ${animated && isHovered ? 'scale-110' : ''}`}
    >
      {/* Background circle with gradient */}
      <defs>
        <linearGradient id="ahoyGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={goldPrimary} />
          <stop offset="50%" stopColor={goldSecondary} />
          <stop offset="100%" stopColor={goldDark} />
        </linearGradient>
        <linearGradient id="ahoyGoldReverse" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={goldPrimary} />
          <stop offset="100%" stopColor={goldDark} />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Outer ring */}
      <circle
        cx="40"
        cy="40"
        r="38"
        stroke="url(#ahoyGold)"
        strokeWidth="2"
        fill="none"
        opacity={animated && isHovered ? "1" : "0.3"}
        className="transition-opacity duration-300"
      />

      {/* Inner background */}
      <circle
        cx="40"
        cy="40"
        r="34"
        fill="#0F172A"
        stroke="url(#ahoyGold)"
        strokeWidth="1"
        opacity="0.5"
      />

      {/* Stylized 'A' - Modern geometric */}
      <path
        d="M40 16L56 58H50L47 50H33L30 58H24L40 16Z"
        fill="url(#ahoyGold)"
        filter={animated && isHovered ? "url(#glow)" : ""}
        className="transition-all duration-300"
      />
      <path
        d="M40 28L45 42H35L40 28Z"
        fill="#0F172A"
      />

      {/* Anchor crossbar - maritime reference */}
      <line
        x1="28"
        y1="44"
        x2="52"
        y2="44"
        stroke="url(#ahoyGold)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Decorative dots - representing network/nodes */}
      <circle cx="22" cy="40" r="2" fill={goldPrimary} opacity="0.6" />
      <circle cx="58" cy="40" r="2" fill={goldPrimary} opacity="0.6" />
      <circle cx="40" cy="64" r="2" fill={goldPrimary} opacity="0.6" />
    </svg>
  );

  // Alternative minimal icon for smaller sizes
  const MinimalIcon = () => (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ahoyGoldMini" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={goldPrimary} />
          <stop offset="100%" stopColor={goldDark} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="#0F172A" />
      <path
        d="M20 8L30 30H26L24 26H16L14 30H10L20 8Z"
        fill="url(#ahoyGoldMini)"
      />
      <path
        d="M20 14L23 22H17L20 14Z"
        fill="#0F172A"
      />
    </svg>
  );

  if (variant === 'icon') {
    return (
      <div
        className={className}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {size === 'sm' ? <MinimalIcon /> : <LogoIcon />}
      </div>
    );
  }

  if (variant === 'wordmark') {
    return (
      <div className={`flex items-center ${className}`}>
        <span
          className={`font-light tracking-wider ${textSize}`}
          style={{
            fontFamily: '"Lexend Deca", "Inter", sans-serif',
            background: `linear-gradient(135deg, ${goldPrimary}, ${goldDark})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          AHOY
        </span>
        <span
          className={`font-extralight tracking-wide text-gray-400 ml-2 ${textSize}`}
          style={{ fontFamily: '"Lexend Deca", "Inter", sans-serif' }}
        >
          Unified Tokenisation
        </span>
      </div>
    );
  }

  // Full variant - icon + wordmark
  return (
    <div
      className={`flex items-center ${spacing} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {size === 'sm' ? <MinimalIcon /> : <LogoIcon />}
      <div className="flex flex-col">
        <span
          className={`font-light tracking-wider leading-none ${textSize}`}
          style={{
            fontFamily: '"Lexend Deca", "Inter", sans-serif',
            background: `linear-gradient(135deg, ${goldPrimary}, ${goldDark})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          AHOY
        </span>
        {size !== 'sm' && (
          <span
            className="text-[9px] uppercase tracking-[0.15em] text-gray-500 font-medium"
            style={{ fontFamily: '"Inter", sans-serif' }}
          >
            Unified Tokenisation
          </span>
        )}
      </div>
    </div>
  );
}

// Institutional Badge variant for headers
export function AhoyInstitutionalBadge({ className = '' }: { className?: string }) {
  const goldPrimary = '#F8B032';
  const goldDark = '#D69A31';

  return (
    <div className={`inline-flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-[#0F172A] to-[#1E293B] rounded-xl border border-[#F8B032]/20 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
        <defs>
          <linearGradient id="badgeGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={goldPrimary} />
            <stop offset="100%" stopColor={goldDark} />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="18" stroke="url(#badgeGold)" strokeWidth="1.5" fill="none" />
        <path d="M20 8L28 28H24L22 24H18L16 28H12L20 8Z" fill="url(#badgeGold)" />
        <path d="M20 13L22.5 20H17.5L20 13Z" fill="#0F172A" />
      </svg>
      <div className="flex flex-col">
        <span
          className="text-sm font-light tracking-wider"
          style={{
            fontFamily: '"Lexend Deca", sans-serif',
            background: `linear-gradient(135deg, ${goldPrimary}, ${goldDark})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          AHOY
        </span>
        <span className="text-[9px] uppercase tracking-[0.15em] text-gray-500">
          Unified Tokenisation Platform
        </span>
      </div>
    </div>
  );
}

// Token symbol for use in balances etc
export function AhoyTokenSymbol({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <defs>
        <linearGradient id="tokenGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F8B032" />
          <stop offset="100%" stopColor="#D69A31" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" stroke="url(#tokenGold)" strokeWidth="1" fill="#0F172A" />
      <path d="M12 5L17 17H14.5L13.5 15H10.5L9.5 17H7L12 5Z" fill="url(#tokenGold)" />
      <path d="M12 8L13.5 12H10.5L12 8Z" fill="#0F172A" />
    </svg>
  );
}
