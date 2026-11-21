import React from 'react';
import {
  CivicIssue,
  IssueCategory,
  IssuePriority,
  IssueStatus,
} from '../shared/types.ts';

export function CivicCrestLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="10" fill="#131b2e" />
      <path
        d="M20 6L31 10.8V19.6C31 26.6 26.3 32.8 20 34.8C13.7 32.8 9 26.6 9 19.6V10.8L20 6Z"
        fill="#006398"
        stroke="#89f5e7"
        strokeWidth="1.5"
      />
      <path
        d="M14.5 20.5L18.2 24.2L26 16"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="29.5" cy="11.5" r="3" fill="#89f5e7" />
    </svg>
  );
}

export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  switch (priority) {
    case IssuePriority.CRITICAL:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container text-xs font-semibold w-max">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-error" />
          </span>
          <span>Critical</span>
        </span>
      );
    case IssuePriority.HIGH:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-semibold w-max">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
          <span>High</span>
        </span>
      );
    case IssuePriority.MEDIUM:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface text-xs font-semibold w-max">
          <span className="h-1.5 w-1.5 rounded-full bg-outline" aria-hidden="true" />
          <span>Medium</span>
        </span>
      );
    case IssuePriority.LOW:
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-xs font-semibold w-max">
          <span className="h-1.5 w-1.5 rounded-full bg-outline-variant" aria-hidden="true" />
          <span>Low</span>
        </span>
      );
  }
}

export function StatusBadge({ status }: { status: IssueStatus }) {
  switch (status) {
    case IssueStatus.RESOLVED:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-xs font-semibold w-max">
          <span className="h-1.5 w-1.5 rounded-full bg-on-tertiary-container" aria-hidden="true" />
          <span>Resolved</span>
        </span>
      );
    case IssueStatus.IN_PROGRESS:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-semibold w-max">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-pulse" aria-hidden="true" />
          <span>In Progress</span>
        </span>
      );
    case IssueStatus.DISPATCHED:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-xs font-semibold w-max">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
          <span>Dispatched</span>
        </span>
      );
    case IssueStatus.TRIAGED:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high text-secondary text-xs font-semibold w-max">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
          <span>AI Triaged</span>
        </span>
      );
    case IssueStatus.REPORTED:
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-xs font-semibold w-max">
          <span className="h-1.5 w-1.5 rounded-full bg-outline" aria-hidden="true" />
          <span>Reported</span>
        </span>
      );
  }
}

export function IssueCategoryThumbnail({
  issue,
  className = 'w-14 h-14',
  caption,
}: {
  issue: Pick<CivicIssue, 'category' | 'image' | 'title' | 'trackingCode'>;
  className?: string;
  caption?: string;
}) {
  if (issue.image?.dataUrl) {
    return (
      <div className={`relative overflow-hidden rounded-lg bg-surface-container ${className}`}>
        <img
          src={issue.image.dataUrl}
          alt={issue.image.altText || `Photo evidence for ${issue.trackingCode}`}
          className="w-full h-full object-cover"
        />
        {caption && (
          <span className="absolute bottom-1 right-1 bg-primary-container/85 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
            {caption}
          </span>
        )}
      </div>
    );
  }

  const palette = (() => {
    switch (issue.category) {
      case IssueCategory.WATER_DRAINAGE:
        return { bg: '#0b2545', accent: '#5bb8fe', sub: '#89f5e7', tag: 'HYDRAULIC' };
      case IssueCategory.ROAD_INFRASTRUCTURE:
        return { bg: '#1e293b', accent: '#f97316', sub: '#cbd5e1', tag: 'ASPHALT' };
      case IssueCategory.STREETLIGHTING:
        return { bg: '#131b2e', accent: '#fde047', sub: '#93ccff', tag: 'GRID OPS' };
      case IssueCategory.SANITATION_WASTE:
        return { bg: '#1b3a34', accent: '#6bd8cb', sub: '#e5eeff', tag: 'SANITATION' };
      case IssueCategory.TRAFFIC_SIGNAGE:
        return { bg: '#2b1c29', accent: '#f43f5e', sub: '#fde047', tag: 'SIGNALS' };
      case IssueCategory.PUBLIC_SAFETY:
        return { bg: '#450a0a', accent: '#ffdad6', sub: '#f87171', tag: 'SAFETY' };
      case IssueCategory.PARKS_RECREATION:
        return { bg: '#064e3b', accent: '#89f5e7', sub: '#a7f3d0', tag: 'FORESTRY' };
      default:
        return { bg: '#1e293b', accent: '#93ccff', sub: '#e5eeff', tag: 'CIVIC 311' };
    }
  })();

  return (
    <div
      className={`relative overflow-hidden rounded-lg flex items-center justify-center ${className}`}
      style={{ backgroundColor: palette.bg }}
      aria-label={`${issue.category} visual telemetry card`}
    >
      <svg viewBox="0 0 120 90" className="w-full h-full" aria-hidden="true">
        <defs>
          <pattern id={`grid-${issue.trackingCode}`} width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width="120" height="90" fill={`url(#grid-${issue.trackingCode})`} />
        <path d="M0 68 Q35 55 70 64 T120 56 L120 90 L0 90 Z" fill="rgba(255,255,255,0.07)" />
        <circle cx="60" cy="40" r="18" fill="rgba(255,255,255,0.08)" stroke={palette.accent} strokeWidth="1.8" />
        <circle cx="60" cy="40" r="6" fill={palette.sub} />
        <path d="M36 40 H44 M76 40 H84 M60 16 V24 M60 56 V64" stroke={palette.accent} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="absolute bottom-1 left-1.5 bg-black/55 text-white text-[9px] font-mono px-1.5 py-0.5 rounded tracking-wider">
        {caption ?? palette.tag}
      </span>
    </div>
  );
}

export function SpatialMapPreview({
  issues,
  selectedIssueId,
  onSelectIssue,
  heightClass = 'h-48',
  showSingleFocus = false,
}: {
  issues: CivicIssue[];
  selectedIssueId?: string | null;
  onSelectIssue?: (id: string) => void;
  heightClass?: string;
  showSingleFocus?: boolean;
}) {
  const focusedIssue =
    issues.find((i) => i.id === selectedIssueId) ?? issues[0] ?? null;

  const pinsToRender = showSingleFocus && focusedIssue ? [focusedIssue] : issues.slice(0, 18);

  const projectCoord = (issue: CivicIssue, index: number) => {
    const lat = issue.coordinates?.lat ?? 41.8781;
    const lng = issue.coordinates?.lng ?? -87.6298;
    // Normalize around 41.85..41.90 and -87.66..-87.60
    const rawX = ((lng + 87.66) / 0.06) * 100;
    const rawY = (1 - (lat - 41.855) / 0.045) * 100;
    const x = Math.max(12, Math.min(88, Number.isFinite(rawX) ? rawX : 20 + ((index * 19) % 60)));
    const y = Math.max(24, Math.min(82, Number.isFinite(rawY) ? rawY : 28 + ((index * 23) % 48)));
    return { x, y };
  };

  return (
    <div
      className={`relative w-full ${heightClass} rounded-xl overflow-hidden bg-[#dce9ff] border border-outline-variant/40 select-none`}
    >
      {/* Vector City GIS Grid */}
      <svg
        viewBox="0 0 800 400"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        <rect width="800" height="400" fill="#e5eeff" />
        {/* Parks / Green zones */}
        <path d="M560 30 Q660 20 750 60 L770 150 Q650 165 550 120 Z" fill="#cbeee7" opacity="0.85" />
        <rect x="60" y="230" width="140" height="90" rx="12" fill="#d3f4ee" opacity="0.7" />
        {/* River / Harbor channel */}
        <path
          d="M0 320 C160 295 290 365 460 315 C590 278 690 310 800 285 L800 335 C680 355 590 325 460 360 C295 408 160 340 0 365 Z"
          fill="#93ccff"
          opacity="0.55"
        />
        {/* Street Arteries */}
        <g stroke="#ffffff" strokeWidth="5" opacity="0.9">
          <line x1="0" y1="95" x2="800" y2="95" />
          <line x1="0" y1="195" x2="800" y2="210" />
          <line x1="0" y1="275" x2="800" y2="265" />
          <line x1="150" y1="0" x2="170" y2="400" />
          <line x1="360" y1="0" x2="345" y2="400" />
          <line x1="560" y1="0" x2="545" y2="400" />
        </g>
        <g stroke="#cbdbf5" strokeWidth="2" strokeDasharray="6 6">
          <line x1="0" y1="145" x2="800" y2="145" />
          <line x1="255" y1="0" x2="255" y2="400" />
          <line x1="455" y1="0" x2="455" y2="400" />
          <line x1="675" y1="0" x2="675" y2="400" />
        </g>
        {/* Ward Boundary Labels */}
        <g fill="#565e74" fontSize="13" fontWeight="700" opacity="0.75">
          <text x="65" y="65">WARD 1 • NORTH MARKET</text>
          <text x="275" y="65">WARD 2 • CENTRAL CORE</text>
          <text x="580" y="65">WARD 3 • HARBOR</text>
          <text x="265" y="255">WARD 4 • ELM CORRIDOR</text>
          <text x="580" y="255">WARD 5 • INDUSTRIAL</text>
        </g>
      </svg>

      {/* Active Issue Pins */}
      {pinsToRender.map((issue, idx) => {
        const pos = showSingleFocus
          ? { x: 50, y: 50 }
          : projectCoord(issue, idx);
        const isSelected = focusedIssue?.id === issue.id;
        const pinColor =
          issue.priority === IssuePriority.CRITICAL
            ? 'bg-error ring-error/30'
            : issue.priority === IssuePriority.HIGH
              ? 'bg-secondary ring-secondary/30'
              : issue.status === IssueStatus.RESOLVED
                ? 'bg-on-tertiary-container ring-tertiary-fixed'
                : 'bg-primary-container ring-primary-fixed';

        return (
          <button
            key={issue.id}
            type="button"
            onClick={() => onSelectIssue?.(issue.id)}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 group focus:outline-none ${
              isSelected ? 'z-20 scale-110' : 'z-10 hover:z-20 hover:scale-110'
            } transition-transform`}
            aria-label={`Select ${issue.trackingCode}: ${issue.title} in ${issue.ward}`}
          >
            {isSelected && (
              <span className="absolute inset-0 -m-3 rounded-full bg-secondary/20 animate-ping pointer-events-none" />
            )}
            <span
              className={`relative flex items-center justify-center w-5 h-5 rounded-full text-white shadow-md ring-4 ${pinColor}`}
            >
              <span className="w-2 h-2 rounded-full bg-white" />
            </span>
            <span className="hidden sm:inline-flex whitespace-nowrap absolute left-1/2 -translate-x-1/2 -top-7 px-2 py-0.5 rounded bg-primary-container text-white font-mono text-[10px] shadow opacity-95">
              {issue.trackingCode}
            </span>
          </button>
        );
      })}

      {/* Coordinate HUD Overlay */}
      {focusedIssue && (
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="bg-surface-container-lowest/95 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm border border-outline-variant/40 flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-error animate-pulse" />
            <span className="font-semibold text-on-surface">
              {focusedIssue.ward} • {focusedIssue.location}
            </span>
          </div>
          <div className="bg-primary-container/90 text-white px-2.5 py-1 rounded-full font-mono text-[11px] shadow-sm">
            {focusedIssue.coordinates
              ? `${focusedIssue.coordinates.lat.toFixed(4)}° N, ${Math.abs(focusedIssue.coordinates.lng).toFixed(4)}° W`
              : '41.8781° N, 87.6298° W'}
          </div>
        </div>
      )}
    </div>
  );
}
