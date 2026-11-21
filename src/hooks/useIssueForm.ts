import { useCallback, useState } from 'react';
import {
  AiTriageAnalysis,
  CivicIssue,
  IssueCategory,
  IssueImageAttachment,
  IssuePriority,
} from '../shared/types.ts';
import {
  inferWardFromLocation,
  validateAnalyzeIssueInput,
  validateCreateIssueInput,
} from '../shared/civicDomain.ts';
import {
  analyzeIssueWithAi,
  CivicApiError,
  polishIssueDescription,
  readImageFileAsAttachment,
} from '../services/civicApi.ts';
import { useCivicIssues } from '../context/CivicContext.tsx';
import { useAnnouncer } from '../a11y/LiveAnnouncer.tsx';

export interface IssueFormValues {
  title: string;
  description: string;
  location: string;
  ward: string;
  category: IssueCategory | 'AUTO';
  priority: IssuePriority | 'AUTO';
  reporterName: string;
  reporterContact: string;
  anonymous: boolean;
  autoClassifyWithAi: boolean;
  image?: IssueImageAttachment;
}

const INITIAL_VALUES: IssueFormValues = {
  title: '',
  description: '',
  location: '',
  ward: 'Ward 4',
  category: 'AUTO',
  priority: 'AUTO',
  reporterName: '',
  reporterContact: '',
  anonymous: false,
  autoClassifyWithAi: true,
  image: undefined,
};

export function useIssueForm(options?: {
  onSubmitted?: (issue: CivicIssue) => void;
}) {
  const { submitNewIssue } = useCivicIssues();
  const { announcePolite, announceAssertive } = useAnnouncer();

  const [values, setValues] = useState<IssueFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fieldOrder, setFieldOrder] = useState<string[]>([]);
  const [submitAttemptCount, setSubmitAttemptCount] = useState(0);

  const [aiPreview, setAiPreview] = useState<AiTriageAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSubmittedIssue, setLastSubmittedIssue] = useState<CivicIssue | null>(null);

  const setField = useCallback(
    <K extends keyof IssueFormValues>(field: K, value: IssueFormValues[K]) => {
      setValues((prev) => {
        const next = { ...prev, [field]: value };
        if (field === 'location' && typeof value === 'string') {
          next.ward = inferWardFromLocation(value);
        }
        return next;
      });
      setErrors((prev) => {
        if (!(field in prev)) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
      if (field === 'title' || field === 'description' || field === 'location') {
        setAiPreview(null);
      }
      setSubmitError(null);
    },
    [],
  );

  const applyPreset = useCallback(
    (preset: { title: string; description: string; location: string; ward: string; category: IssueCategory }) => {
      setValues((prev) => ({
        ...prev,
        title: preset.title,
        description: preset.description,
        location: preset.location,
        ward: preset.ward,
        category: preset.category,
      }));
      setErrors({});
      setAiError(null);
      setSubmitError(null);
      setAiPreview(null);
      announcePolite(`Loaded simulator preset: ${preset.title}`);
    },
    [announcePolite],
  );

  const attachImageFile = useCallback(
    async (file: File | null, customAltText?: string) => {
      if (!file) {
        setValues((prev) => ({ ...prev, image: undefined }));
        setErrors((prev) => {
          const next = { ...prev };
          delete next.image;
          return next;
        });
        return;
      }

      try {
        const attachment = await readImageFileAsAttachment(file, customAltText);
        setValues((prev) => ({ ...prev, image: attachment }));
        setErrors((prev) => {
          const next = { ...prev };
          delete next.image;
          return next;
        });
        setAiPreview(null);
        announcePolite(`Attached image ${file.name}.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to attach image.';
        setErrors((prev) => ({ ...prev, image: msg }));
        announceAssertive(msg);
      }
    },
    [announcePolite, announceAssertive],
  );

  const updateImageAltText = useCallback((altText: string) => {
    setValues((prev) =>
      prev.image
        ? { ...prev, image: { ...prev.image, altText } }
        : prev,
    );
  }, []);

  const polishDescription = useCallback(async () => {
    setAiError(null);
    if (values.description.trim().length < 10) {
      setErrors((prev) => ({
        ...prev,
        description: 'Enter at least 10 characters in the description before using AI Polish.',
      }));
      return;
    }
    setIsPolishing(true);
    try {
      const { description } = await polishIssueDescription({
        title: values.title,
        description: values.description,
        location: values.location,
      });
      setValues((prev) => ({ ...prev, description }));
      setAiPreview(null);
      announcePolite('Description polished with Gemini AI for municipal dispatch clarity.');
    } catch (err) {
      const msg =
        err instanceof CivicApiError
          ? err.message
          : 'Unable to polish description right now.';
      setAiError(msg);
      announceAssertive(msg);
    } finally {
      setIsPolishing(false);
    }
  }, [values.title, values.description, values.location, announcePolite, announceAssertive]);

  const analyzeWithAi = useCallback(async (): Promise<AiTriageAnalysis | null> => {
    setAiError(null);
    const validation = validateAnalyzeIssueInput({
      title: values.title,
      description: values.description,
      location: values.location,
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      setFieldOrder(validation.fieldOrder);
      setSubmitAttemptCount((c) => c + 1);
      announceAssertive(
        'Please enter a valid issue title and description before running AI analysis.',
      );
      return null;
    }

    setIsAnalyzing(true);
    try {
      const { analysis } = await analyzeIssueWithAi({
        title: values.title,
        description: values.description,
        location: values.location,
        categoryHint: values.category === 'AUTO' ? undefined : values.category,
        image: values.image,
      });
      setAiPreview(analysis);
      announcePolite(
        `Gemini AI analysis complete. Suggested category: ${analysis.detectedCategory}. Priority: ${analysis.detectedPriority}. Recommended department: ${analysis.recommendedDepartment}.`,
      );
      return analysis;
    } catch (err) {
      const msg =
        err instanceof CivicApiError
          ? err.message
          : 'Unable to complete Gemini AI analysis right now.';
      setAiError(msg);
      announceAssertive(msg);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [values, announcePolite, announceAssertive]);

  const submitIssue = useCallback(async (): Promise<CivicIssue | null> => {
    setSubmitError(null);
    const payload = {
      title: values.title,
      description: values.description,
      location: values.location,
      ward: values.ward,
      category: values.category === 'AUTO' ? undefined : values.category,
      priority: values.priority === 'AUTO' ? undefined : values.priority,
      reporterName: values.anonymous ? 'Anonymous Citizen' : values.reporterName || undefined,
      reporterContact: values.anonymous ? undefined : values.reporterContact || undefined,
      image: values.image,
      autoClassifyWithAi: values.autoClassifyWithAi,
      precomputedAiAnalysis: aiPreview ?? undefined,
    };

    const validation = validateCreateIssueInput(payload);
    if (!validation.valid) {
      setErrors(validation.errors);
      setFieldOrder(validation.fieldOrder);
      setSubmitAttemptCount((c) => c + 1);
      announceAssertive(
        `Form has ${validation.fieldOrder.length} validation ${
          validation.fieldOrder.length === 1 ? 'error' : 'errors'
        }.`,
      );
      return null;
    }

    setIsSubmitting(true);
    try {
      const created = await submitNewIssue(payload);
      setLastSubmittedIssue(created);
      setValues(INITIAL_VALUES);
      setErrors({});
      setFieldOrder([]);
      setAiPreview(null);
      setAiError(null);
      options?.onSubmitted?.(created);
      return created;
    } catch (err) {
      if (err instanceof CivicApiError && err.details) {
        setErrors(err.details);
        setFieldOrder(Object.keys(err.details));
        setSubmitAttemptCount((c) => c + 1);
      }
      const msg =
        err instanceof CivicApiError || err instanceof Error
          ? err.message
          : 'Failed to submit civic issue. Please try again.';
      setSubmitError(msg);
      announceAssertive(msg);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [values, aiPreview, submitNewIssue, announceAssertive, options]);

  const resetForm = useCallback(() => {
    setValues(INITIAL_VALUES);
    setErrors({});
    setFieldOrder([]);
    setAiPreview(null);
    setAiError(null);
    setSubmitError(null);
  }, []);

  return {
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
    resetForm,
  };
}
