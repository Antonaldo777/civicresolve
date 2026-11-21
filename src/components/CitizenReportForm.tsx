import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Compass,
  Droplets,
  FileText,
  ImagePlus,
  Lightbulb,
  MapPin,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
import { CivicIssue, IssueCategory, IssuePriority } from '../shared/types.ts';
import {
  deriveCoordinatesForLocation,
  getDefaultDepartmentForCategory,
  WARDS,
} from '../shared/civicDomain.ts';
import { useIssueForm } from '../hooks/useIssueForm.ts';
import {
  AccessibleErrorSummary,
  AccessibleField,
} from '../a11y/primitives.tsx';
import { useFocusErrorSummary } from '../a11y/useFocusManagement.ts';
import { PriorityBadge, SpatialMapPreview } from './CivicGraphics.tsx';
import { useCivicIssues } from '../context/CivicContext.tsx';

interface CitizenReportFormProps {
  onIssueSubmitted?: (issue: CivicIssue) => void;
  onGoToTracker?: () => void;
}

const SIMULATOR_PRESETS: Array<{
  id: string;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  location: string;
  ward: string;
  category: IssueCategory;
}> = [
  {
    id: 'pothole',
    label: 'Dangerous Pothole',
    sublabel: 'Elm St • Ward 4',
    icon: <AlertTriangle className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />,
    title: 'Deep pothole damaging cars near elementary school on Elm & 4th',
    description:
      'Deep cavity roughly 9 inches deep right on the westbound lane immediately fronting the Lincoln Elementary crossing. Multiple passenger sedans bottomed out this morning, causing tire rim damage. Children cross here daily at 8:15 AM.',
    location: '412 Elm Street (Intersection 4th Ave), Ward 4',
    ward: 'Ward 4',
    category: IssueCategory.ROAD_INFRASTRUCTURE,
  },
  {
    id: 'watermain',
    label: 'Broken Water Main',
    sublabel: '5th Ave • Ward 2',
    icon: <Droplets className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />,
    title: 'Broken high-pressure water main flooding avenue traffic lanes',
    description:
      'Continuous subterranean geyser pushing water through curb asphalt at 5th Ave and Grant. Street surface is buckling slightly under hydraulic pressure with water 4 inches deep across the sidewalk.',
    location: '1420 5th Avenue, Ward 2',
    ward: 'Ward 2',
    category: IssueCategory.WATER_DRAINAGE,
  },
  {
    id: 'streetlight',
    label: 'Flickering Streetlight',
    sublabel: 'Highland Way • Ward 7',
    icon: <Lightbulb className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />,
    title: 'Flickering high-mast streetlight and dark pedestrian crosswalk',
    description:
      'Streetlight 44B-9 is rapidly strobing and shuts off completely after sunset. Leaves the pedestrian refuge island on Highland Way completely dark, creating hazardous visibility conditions for evening cyclists.',
    location: '880 Highland Way, Ward 7',
    ward: 'Ward 7',
    category: IssueCategory.STREETLIGHTING,
  },
  {
    id: 'dumpster',
    label: 'Overflowing Dumpster',
    sublabel: 'Pine Alley • Ward 1',
    icon: <Trash2 className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />,
    title: 'Overflowing commercial dumpster blocking public alley access',
    description:
      'Commercial waste container behind Market Square restaurants has spilled across the public easement alley. Food waste and cardboard are attracting rodents and obstructing the fire service lane.',
    location: '210 Pine Alley, Ward 1',
    ward: 'Ward 1',
    category: IssueCategory.SANITATION_WASTE,
  },
];

export function CitizenReportForm({
  onIssueSubmitted,
  onGoToTracker,
}: CitizenReportFormProps) {
  const { issues, stats, aiConfigured, firebaseUser } = useCivicIssues();
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const {
    values,
    errors,
    fieldOrder,
    submitAttemptCount,
    aiPreview,
    isAnalyzing,
    isPolishing,
    aiError,
    isSubmitting,
    submitError,
    lastSubmittedIssue,
    setField,
    applyPreset,
    attachImageFile,
    updateImageAltText,
    polishDescription,
    analyzeWithAi,
    submitIssue,
  } = useIssueForm({ onSubmitted: onIssueSubmitted });

  useFocusErrorSummary(errorSummaryRef, fieldOrder.length > 0, submitAttemptCount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitIssue();
  };

  const handleAcquireGps = () => {
    setGpsStatus('Acquiring coordinates...');
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(4);
          const lng = pos.coords.longitude.toFixed(4);
          setField(
            'location',
            `GPS Verified: ${lat}° N, ${lng}° W (${values.ward} Corridor)`,
          );
          setGpsStatus(`Locked ${lat}, ${lng}`);
        },
        () => {
          setField('location', '412 Elm Street (GPS: 41.8781° N, 87.6298° W), Ward 4');
          setField('ward', 'Ward 4');
          setGpsStatus('Simulated municipal GPS lock acquired');
        },
        { timeout: 3500 },
      );
    } else {
      setField('location', '412 Elm Street (GPS: 41.8781° N, 87.6298° W), Ward 4');
      setField('ward', 'Ward 4');
      setGpsStatus('Municipal GPS coordinates applied');
    }
  };

  const handleVoiceToggle = () => {
    setVoiceNotice(null);
    const SpeechRec =
      typeof window !== 'undefined'
        ? ((window as unknown as Record<string, unknown>).SpeechRecognition ||
            (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
        : undefined;

    if (!SpeechRec) {
      setIsRecordingVoice(false);
      setVoiceNotice(
        'Browser speech dictation is unavailable in this environment; please type or load a simulator preset.',
      );
      return;
    }

    if (isRecordingVoice) {
      setIsRecordingVoice(false);
      return;
    }

    try {
      const RecognitionCtor = SpeechRec as new () => {
        lang: string;
        interimResults: boolean;
        onresult: (evt: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      };
      const recognition = new RecognitionCtor();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? '';
        if (transcript) {
          setField(
            'description',
            `${values.description ? `${values.description.trim()} ` : ''}${transcript}`.trim(),
          );
        }
      };
      recognition.onerror = () => {
        setIsRecordingVoice(false);
        setVoiceNotice('Voice microphone access was declined or unavailable.');
      };
      recognition.onend = () => setIsRecordingVoice(false);
      setIsRecordingVoice(true);
      recognition.start();
    } catch {
      setIsRecordingVoice(false);
      setVoiceNotice('Unable to initialize microphone dictation.');
    }
  };

  const previewCoordinates = deriveCoordinatesForLocation(
    values.location || 'Elm & 4th Ave',
    values.ward,
  );

  const syntheticMapIssue: CivicIssue = {
    id: 'preview-pin',
    trackingCode: 'NEW-PIN',
    title: values.title || 'Draft Civic Report',
    description: values.description || '',
    location: values.location || 'Enter street address or intersection',
    ward: values.ward,
    coordinates: previewCoordinates,
    category:
      values.category === 'AUTO'
        ? IssueCategory.ROAD_INFRASTRUCTURE
        : values.category,
    priority:
      aiPreview?.detectedPriority ??
      (values.priority === 'AUTO' ? IssuePriority.HIGH : values.priority),
    status: (issues[0]?.status ?? 'Reported') as CivicIssue['status'],
    assignedDepartment:
      aiPreview?.recommendedDepartment ??
      getDefaultDepartmentForCategory(
        values.category === 'AUTO'
          ? IssueCategory.ROAD_INFRASTRUCTURE
          : values.category,
      ),
    aiApproved: false,
    endorsementCount: 1,
    statusHistory: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const previewDepartment =
    aiPreview?.recommendedDepartment ??
    (values.category !== 'AUTO'
      ? getDefaultDepartmentForCategory(values.category)
      : 'Department of Transportation & Public Works');

  const previewPriority =
    aiPreview?.detectedPriority ??
    (values.priority !== 'AUTO' ? values.priority : IssuePriority.HIGH);

  const previewCategory =
    aiPreview?.detectedCategory ??
    (values.category !== 'AUTO'
      ? values.category
      : 'Awaiting Gemini Triage Preview');

  return (
    <div className="flex flex-col w-full">
      {/* Top Telemetry & Status Ribbon */}
      <div className="w-full bg-surface-container-low border-b border-outline-variant/30 py-2 px-4 lg:px-6 mb-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-xs bg-tertiary-fixed text-on-tertiary-fixed font-semibold shadow-xs">
              <span className="h-2 w-2 rounded-full bg-on-tertiary-container animate-ping" aria-hidden="true" />
              <span>
                {aiConfigured === true
                  ? 'GEMINI TRIAGE LIVE'
                  : aiConfigured === false
                    ? 'GEMINI API KEY REQUIRED'
                    : 'CHECKING GEMINI STATUS'}
              </span>
            </span>
            <span className="font-mono text-xs text-on-surface-variant hidden sm:inline">
              Dispatch Pipeline: Ward 1 to Ward 7 Active
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
              <span>
                {aiPreview?.latencyMs ? `Last Triage: ${aiPreview.latencyMs}ms` : 'Avg Latency: 1.1s'}
              </span>
            </span>
            <span className="hidden md:flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
              <span>{stats.total} Ledger Records</span>
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-6 w-full pb-10">
        {/* Editorial Heading */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-secondary font-semibold mb-1">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>Autonomous Civic Service Protocol</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight mb-2">
            Report a Civic Issue
          </h1>
          <p className="text-base text-on-surface-variant max-w-3xl">
            Describe any municipal infrastructure problem or upload a photo. Google Gemini AI automatically categorizes the issue, evaluates public urgency, and routes it to the responsible department.
          </p>
          {!firebaseUser && (
            <p className="mt-3 text-sm text-secondary" role="status">
              Sign in with a verified Google account using the button in the header to submit reports or use AI assistance.
            </p>
          )}
          {aiConfigured === false && (
            <p className="mt-2 text-sm text-secondary" role="status">
              Gemini is not configured. Set GEMINI_API_KEY on the server for AI features, or turn off auto-classification to submit a manually triaged report.
            </p>
          )}
        </div>

        {/* Submission Confirmation Banner */}
        {lastSubmittedIssue && (
          <div
            role="status"
            className="mb-6 rounded-xl bg-tertiary-fixed/70 border border-on-tertiary-container/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-on-tertiary-container shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-bold text-on-tertiary-fixed">
                  Issue Logged: {lastSubmittedIssue.trackingCode} — {lastSubmittedIssue.title}
                </h2>
                <p className="text-xs text-on-tertiary-fixed-variant mt-0.5">
                  Categorized as <strong>{lastSubmittedIssue.category}</strong> ({lastSubmittedIssue.priority} Priority) and routed to{' '}
                  <strong>{lastSubmittedIssue.assignedDepartment}</strong>.
                </p>
              </div>
            </div>
            {onGoToTracker && (
              <button
                type="button"
                onClick={onGoToTracker}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-container text-white text-xs font-semibold hover:bg-on-primary-fixed-variant shrink-0"
              >
                <span>Track in Public Hub</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* Quick Scenario Presets Strip */}
        <section
          aria-label="Live Simulator Presets"
          className="mb-6 p-4 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/40"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
              <span>Live Simulator Presets (Click to autofill &amp; test):</span>
            </span>
            <span className="font-mono text-xs text-secondary font-medium">
              Interactive Test Bench
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {SIMULATOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="text-left p-3 rounded-lg bg-surface-container-low hover:bg-surface-container-high border border-transparent hover:border-secondary/30 transition-colors flex items-start gap-2.5 group"
              >
                <span className="mt-0.5 group-hover:scale-110 transition-transform">
                  {preset.icon}
                </span>
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-on-surface block truncate">
                    {preset.label}
                  </span>
                  <span className="font-mono text-[11px] text-on-surface-variant block truncate">
                    {preset.sublabel}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Main Two-Column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Citizen Submission Form */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <form
              noValidate
              onSubmit={handleSubmit}
              className="bg-surface-container-lowest p-5 sm:p-6 rounded-xl shadow-sm border border-outline-variant/40 flex flex-col gap-5"
            >
              <div className="flex items-center justify-between pb-2 border-b border-surface-container">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-secondary" aria-hidden="true" />
                  <h2 className="font-display text-xl font-semibold text-on-surface">
                    Incident Description
                  </h2>
                </div>
                <span className="font-mono text-xs bg-surface-container px-2.5 py-0.5 rounded text-on-surface-variant">
                  Step 1 of 2
                </span>
              </div>

              <AccessibleErrorSummary
                errors={errors}
                fieldOrder={fieldOrder}
                fieldIdPrefix="issue-"
                summaryRef={errorSummaryRef}
              />

              {submitError && (
                <div
                  role="alert"
                  className="rounded-lg bg-error-container text-on-error-container p-3 text-sm font-medium"
                >
                  {submitError}
                </div>
              )}

              {/* Title Input */}
              <AccessibleField
                id="issue-title"
                label="Issue Summary or Title"
                required
                hint="Concise headline (5 to 140 characters)."
                error={errors.title}
              >
                {(a11yProps) => (
                  <input
                    {...a11yProps}
                    type="text"
                    maxLength={140}
                    value={values.title}
                    onChange={(e) => setField('title', e.target.value)}
                    placeholder="e.g., Deep pothole damaging cars on Elm & 4th"
                    className="w-full bg-surface-container-low text-on-surface placeholder:text-outline rounded-lg px-3.5 py-2.5 text-sm border border-outline-variant/50 focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary"
                  />
                )}
              </AccessibleField>

              {/* Detailed Description + AI Polish & Voice */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="issue-description" className="block text-sm font-medium text-on-surface">
                    Detailed Observation <span className="text-error" aria-hidden="true">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPolishing || !firebaseUser || aiConfigured !== true}
                      onClick={() => void polishDescription()}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:text-on-secondary-container bg-surface-container-low hover:bg-surface-container px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                    >
                      <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isPolishing ? 'Polishing...' : 'AI Polish'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleVoiceToggle}
                      aria-pressed={isRecordingVoice}
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                        isRecordingVoice
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isRecordingVoice ? 'Listening...' : 'Voice In'}</span>
                    </button>
                  </div>
                </div>
                <textarea
                  id="issue-description"
                  rows={4}
                  aria-required="true"
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={errors.description ? 'issue-description-error' : 'issue-description-hint'}
                  value={values.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Explain the hazard, vehicle impact, pedestrian risk, or observed municipal degradation..."
                  className="w-full bg-surface-container-low text-on-surface placeholder:text-outline rounded-lg p-3.5 text-sm border border-outline-variant/50 focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary"
                />
                <p id="issue-description-hint" className="text-xs text-on-surface-variant">
                  Include safety impact, nearby landmarks, or affected infrastructure (minimum 15 characters).
                </p>
                {voiceNotice && (
                  <p role="status" className="text-xs text-secondary font-medium">
                    {voiceNotice}
                  </p>
                )}
                {errors.description && (
                  <p id="issue-description-error" role="alert" className="text-xs font-medium text-error">
                    {errors.description}
                  </p>
                )}
              </div>

              {/* Optional Category & Priority Hints */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="issue-category" className="block text-sm font-medium text-on-surface">
                    Issue Category
                  </label>
                  <select
                    id="issue-category"
                    value={values.category}
                    onChange={(e) => setField('category', e.target.value as IssueCategory | 'AUTO')}
                    className="w-full bg-surface-container-low text-on-surface text-sm rounded-lg px-3 py-2.5 border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary"
                  >
                    <option value="AUTO">Auto-Detect via Google Gemini AI</option>
                    {Object.values(IssueCategory).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="issue-priority" className="block text-sm font-medium text-on-surface">
                    Urgency Assessment
                  </label>
                  <select
                    id="issue-priority"
                    value={values.priority}
                    onChange={(e) => setField('priority', e.target.value as IssuePriority | 'AUTO')}
                    className="w-full bg-surface-container-low text-on-surface text-sm rounded-lg px-3 py-2.5 border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary"
                  >
                    <option value="AUTO">Auto-Score Urgency with Gemini AI</option>
                    {Object.values(IssuePriority).map((prio) => (
                      <option key={prio} value={prio}>
                        {prio}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Photographic Evidence Upload */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="issue-photo-upload" className="text-sm font-medium text-on-surface">
                    Photographic Evidence <span className="font-mono text-xs text-secondary">(Optional Vision Triage)</span>
                  </label>
                  <span className="font-mono text-[11px] text-on-tertiary-container bg-surface-container-high px-2 py-0.5 rounded">
                    Auto-Compressed for Cloud Sync
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/40 flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-full sm:w-36 h-28 rounded-lg overflow-hidden bg-surface-container flex items-center justify-center shrink-0 border border-outline-variant/40">
                    {values.image ? (
                      <img
                        src={values.image.dataUrl}
                        alt={values.image.altText}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-on-surface-variant p-2 text-center">
                        <ImagePlus className="w-6 h-6 text-secondary" aria-hidden="true" />
                        <span className="font-mono text-[11px]">No photo yet</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
                      <Brain className="w-4 h-4 text-secondary" aria-hidden="true" />
                      <span>Gemini Multimodal Vision Scan</span>
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      {values.image
                        ? `Attached: ${values.image.fileName}. Gemini analyzes visual damage severity automatically.`
                        : 'Attach a JPEG, PNG, or WebP photo of the hazard for automated multimodal damage scoring.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold bg-surface-container-highest hover:bg-surface-container-high text-on-surface px-3 py-1.5 rounded-lg transition-colors">
                        <ImagePlus className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
                        <span>{values.image ? 'Replace Image' : 'Upload Photo'}</span>
                        <input
                          ref={fileInputRef}
                          id="issue-photo-upload"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            void attachImageFile(file);
                          }}
                        />
                      </label>
                      {values.image && (
                        <button
                          type="button"
                          onClick={() => {
                            void attachImageFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="text-xs font-semibold text-error hover:underline"
                        >
                          Remove Photo
                        </button>
                      )}
                    </div>
                    {values.image && (
                      <div className="pt-1">
                        <label htmlFor="issue-image-alt" className="sr-only">
                          Photo accessibility description
                        </label>
                        <input
                          id="issue-image-alt"
                          type="text"
                          value={values.image.altText}
                          onChange={(e) => updateImageAltText(e.target.value)}
                          placeholder="Describe what the photo shows for accessibility..."
                          className="w-full bg-surface-container-lowest text-on-surface text-xs rounded-md px-2.5 py-1.5 border border-outline-variant/50"
                        />
                      </div>
                    )}
                    {errors.image && (
                      <p role="alert" className="text-xs font-medium text-error">
                        {errors.image}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Location & Ward Boundary */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="issue-location" className="text-sm font-medium text-on-surface">
                    Incident Location &amp; Ward Boundary <span className="text-error" aria-hidden="true">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAcquireGps}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"
                  >
                    <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Use Current GPS</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2 relative">
                    <MapPin className="w-4 h-4 absolute left-3 top-3 text-secondary" aria-hidden="true" />
                    <input
                      id="issue-location"
                      type="text"
                      aria-required="true"
                      aria-invalid={Boolean(errors.location)}
                      aria-describedby={errors.location ? 'issue-location-error' : undefined}
                      value={values.location}
                      onChange={(e) => setField('location', e.target.value)}
                      placeholder="Street address, intersection, or landmark..."
                      className="w-full bg-surface-container-low text-on-surface placeholder:text-outline rounded-lg pl-9 pr-3 py-2.5 text-sm border border-outline-variant/50 focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                  <div>
                    <label htmlFor="issue-ward" className="sr-only">
                      Select Ward
                    </label>
                    <select
                      id="issue-ward"
                      value={values.ward}
                      onChange={(e) => setField('ward', e.target.value)}
                      className="w-full bg-surface-container-low text-on-surface text-sm rounded-lg px-3 py-2.5 border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary"
                    >
                      {WARDS.map((ward) => (
                        <option key={ward} value={ward}>
                          {ward}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {gpsStatus && (
                  <p role="status" className="font-mono text-xs text-on-tertiary-container">
                    {gpsStatus}
                  </p>
                )}
                {errors.location && (
                  <p id="issue-location-error" role="alert" className="text-xs font-medium text-error">
                    {errors.location}
                  </p>
                )}

                <SpatialMapPreview
                  issues={[syntheticMapIssue]}
                  selectedIssueId={syntheticMapIssue.id}
                  showSingleFocus
                  heightClass="h-36"
                />
              </div>

              {/* Citizen Contact & Privacy Toggle */}
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-on-surface">
                    Notification Preferences
                  </span>
                  <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-full shadow-xs border border-outline-variant/30">
                    <button
                      type="button"
                      aria-pressed={!values.anonymous}
                      onClick={() => setField('anonymous', false)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                        !values.anonymous
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      SMS / Email Updates
                    </button>
                    <button
                      type="button"
                      aria-pressed={values.anonymous}
                      onClick={() => setField('anonymous', true)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                        values.anonymous
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Submit Anonymously
                    </button>
                  </div>
                </div>

                {!values.anonymous ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="issue-reporter-name" className="font-mono text-xs text-on-surface-variant block mb-1">
                        Citizen Name (Optional)
                      </label>
                      <input
                        id="issue-reporter-name"
                        type="text"
                        value={values.reporterName}
                        onChange={(e) => setField('reporterName', e.target.value)}
                        placeholder="Marcus Reid"
                        className="w-full bg-surface-container-lowest text-on-surface text-sm rounded-lg px-3 py-2 border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary"
                      />
                    </div>
                    <div>
                      <label htmlFor="issue-reporterContact" className="font-mono text-xs text-on-surface-variant block mb-1">
                        Private Contact (Email or SMS — Isolated from Public Ledger)
                      </label>
                      <input
                        id="issue-reporterContact"
                        type="text"
                        value={values.reporterContact}
                        onChange={(e) => setField('reporterContact', e.target.value)}
                        placeholder="resident@example.org or +1 (555) 392-8114"
                        className="w-full bg-surface-container-lowest text-on-surface text-sm rounded-lg px-3 py-2 border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant">
                    Anonymous submission active. No personal contact details will be stored.
                  </p>
                )}
              </div>

              {/* AI Auto-Classification Toggle */}
              <div className="flex flex-col gap-2 pt-1">
                <label className="inline-flex items-center gap-2.5 text-xs font-medium text-on-surface cursor-pointer select-none">
                  <input
                    id="issue-auto-classify"
                    type="checkbox"
                    checked={values.autoClassifyWithAi}
                    onChange={(e) => setField('autoClassifyWithAi', e.target.checked)}
                    className="rounded text-primary w-4 h-4 cursor-pointer"
                  />
                  <span>
                    Auto-classify category, urgency, and municipal department with Google Gemini AI on submit
                  </span>
                </label>

                {submitError && submitError.toLowerCase().includes('gemini') && (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low p-2.5 text-xs">
                    <span className="text-on-surface-variant">
                      Want to submit immediately without waiting for Gemini?
                    </span>
                    <button
                      type="button"
                      onClick={() => setField('autoClassifyWithAi', false)}
                      className="px-2.5 py-1 rounded bg-secondary text-on-secondary font-semibold shrink-0"
                    >
                      Switch to Manual Triage
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-1 flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !firebaseUser ||
                    (values.autoClassifyWithAi && aiConfigured !== true)
                  }
                  className="flex-1 bg-primary hover:bg-on-primary-fixed-variant text-on-primary font-semibold text-sm py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-60"
                >
                  <Sparkles className="w-4 h-4 text-tertiary-fixed-dim" aria-hidden="true" />
                  <span>
                    {isSubmitting
                      ? 'Submitting & Routing...'
                      : !firebaseUser
                        ? 'Sign In to Submit Complaint'
                        : values.autoClassifyWithAi
                          ? 'Run Gemini AI Analysis & Submit Complaint'
                          : 'Submit Civic Complaint (Manual Triage)'}
                  </span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <p className="font-mono text-xs text-on-surface-variant text-center">
                PII contact fields are isolated into protected municipal storage • Instant tracking code issued
              </p>
            </form>

            {/* Transparency Pledge Box */}
            <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/40 flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-secondary shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-on-surface">
                  Municipal Transparency &amp; PII Isolation Guarantee
                </h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Public incident records publish only civic hazard metadata, ward coordinates, and AI triage rationale. Reporter contact info is stored separately in restricted municipal Cloud Firestore contact collections.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Sticky Live Gemini AI Triage Preview */}
          <aside className="lg:col-span-5 flex flex-col gap-4 lg:sticky lg:top-28">
            <div className="bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 p-5 sm:p-6 relative overflow-hidden flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-surface-container-high text-secondary">
                    <Brain className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-semibold text-on-surface leading-tight">
                      Gemini Live Triage
                    </h2>
                    <span className="font-mono text-xs text-secondary">
                      Inference Agent • {aiConfigured ? 'Live API' : 'Server Triage'}
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-low font-mono text-xs text-on-surface">
                  <span className="h-2 w-2 rounded-full bg-on-tertiary-container animate-pulse" />
                  <span>{isAnalyzing ? 'Evaluating...' : aiPreview ? 'Triage Ready' : 'Standby'}</span>
                </span>
              </div>

              {aiError && (
                <div role="alert" className="rounded-lg bg-error-container text-on-error-container p-3 text-xs font-medium">
                  {aiError}
                </div>
              )}

              {/* Categorization & Confidence */}
              <div className="p-4 rounded-xl bg-surface-container-low space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                    AI Categorization
                  </span>
                  <span className="font-mono text-xs text-secondary font-bold tabular-nums">
                    {aiPreview
                      ? `${Math.round(aiPreview.confidence * 100)}% Confidence`
                      : 'Click Preview Below'}
                  </span>
                </div>
                <div className="font-display text-lg font-bold text-on-surface">
                  {previewCategory}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(aiPreview?.tags?.length
                    ? aiPreview.tags
                    : ['Civic Infrastructure', values.ward, 'Automated Routing']
                  ).map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container-highest text-on-surface"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Assessed Priority & SLA */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-surface-container-low flex flex-col justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Assessed Priority
                  </span>
                  <PriorityBadge priority={previewPriority} />
                  <span className="font-mono text-[11px] text-on-surface-variant">
                    {aiPreview ? `Urgency Score: ${aiPreview.urgencyScore}/100` : 'Impact weighted'}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-container-low flex flex-col justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Estimated SLA
                  </span>
                  <span className="font-display text-xl font-bold text-on-surface tabular-nums">
                    &lt; {aiPreview?.estimatedSlaHours ?? 8} Hours
                  </span>
                  <span className="font-mono text-[11px] text-secondary">
                    Rapid response target
                  </span>
                </div>
              </div>

              {/* Reasoning Stream */}
              <div className="p-3.5 rounded-xl bg-surface-container-low space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-on-surface">
                    Gemini Reasoning Stream
                  </span>
                  <span className="font-mono text-[11px] text-on-surface-variant">
                    {aiPreview?.tokensProcessed ? `${aiPreview.tokensProcessed} tokens` : 'Real-time'}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 leading-relaxed">
                  {aiPreview?.publicImpactSummary
                    ? `"${aiPreview.publicImpactSummary}"`
                    : '"Enter a title and description or pick a simulator preset, then run a live Gemini preview to inspect classification rationale before submitting."'}
                </p>
              </div>

              {/* Department Route */}
              <div className="p-3.5 rounded-xl bg-surface-container-low space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Automated Dispatch Target
                </span>
                <div className="text-sm font-semibold text-on-surface">
                  {previewDepartment}
                </div>
                <div className="font-mono text-[11px] text-secondary">
                  {values.ward} Dispatch Queue • Staff review required
                </div>
              </div>

              {/* Recommended Actions */}
              {aiPreview?.recommendedActions && aiPreview.recommendedActions.length > 0 && (
                <div className="p-3.5 rounded-xl bg-surface-container-low space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Recommended Crew Actions
                  </span>
                  <ul className="space-y-1 text-xs text-on-surface">
                    {aiPreview.recommendedActions.map((act, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-secondary shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                disabled={isAnalyzing || !firebaseUser || aiConfigured !== true}
                onClick={() => void analyzeWithAi()}
                className="w-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 text-secondary ${isAnalyzing ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{isAnalyzing ? 'Analyzing with Gemini...' : 'Preview Classification with Google Gemini'}</span>
              </button>
            </div>

            {/* Metric Spark Summary Panel */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/40">
                <span className="font-mono text-xs text-on-surface-variant">Active Municipal Queue</span>
                <div className="font-display text-2xl font-bold text-on-surface mt-1 tabular-nums">
                  {stats.total} Issues
                </div>
                <span className="font-mono text-xs text-on-tertiary-container">
                  {stats.openUrgentCount} High/Critical open
                </span>
              </div>
              <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/40">
                <span className="font-mono text-xs text-on-surface-variant">Resolution Rate</span>
                <div className="font-display text-2xl font-bold text-on-surface mt-1 tabular-nums">
                  {stats.resolutionRatePercent}%
                </div>
                <span className="font-mono text-xs text-secondary">
                  {aiConfigured === true
                    ? 'Gemini Auto-Routing Active'
                    : aiConfigured === false
                      ? 'Manual routing until Gemini is configured'
                      : 'Checking Gemini availability'}
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
