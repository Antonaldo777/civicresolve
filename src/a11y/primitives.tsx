import React from 'react';

export function SkipLink({
  targetId = 'main-content',
  label = 'Skip to main content',
}: {
  targetId?: string;
  label?: string;
}) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
    >
      {label}
    </a>
  );
}

export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export interface AccessibleErrorSummaryProps {
  errors: Record<string, string>;
  fieldOrder?: string[];
  fieldIdPrefix?: string;
  title?: string;
  summaryRef?: React.RefObject<HTMLDivElement | null>;
}

export function AccessibleErrorSummary({
  errors,
  fieldOrder,
  fieldIdPrefix = 'field-',
  title = 'Please fix the following errors before continuing:',
  summaryRef,
}: AccessibleErrorSummaryProps) {
  const keys = fieldOrder
    ? fieldOrder.filter((k) => Boolean(errors[k]))
    : Object.keys(errors).filter((k) => Boolean(errors[k]));

  if (keys.length === 0) {
    return null;
  }

  return (
    <div
      ref={summaryRef}
      role="alert"
      aria-labelledby="error-summary-heading"
      tabIndex={-1}
      className="rounded-md border border-red-300 bg-red-50 p-4 text-red-900 focus:outline-2 focus:outline-offset-2 focus:outline-red-700"
    >
      <h2 id="error-summary-heading" className="text-sm font-semibold">
        {title}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {keys.map((key) => (
          <li key={key}>
            <a
              href={`#${fieldIdPrefix}${key}`}
              className="underline hover:text-red-700 focus:outline-2 focus:outline-red-700"
              onClick={(e) => {
                const target = document.getElementById(`${fieldIdPrefix}${key}`);
                if (target) {
                  e.preventDefault();
                  target.focus();
                }
              }}
            >
              {errors[key]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface AccessibleFieldRenderProps {
  id: string;
  'aria-invalid': boolean;
  'aria-required'?: boolean;
  'aria-describedby'?: string;
}

export function AccessibleField({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: (props: AccessibleFieldRenderProps) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-900">
        {label}
        {required && (
          <span className="ml-1 text-red-700" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-required': required,
        'aria-describedby': describedBy,
      })}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
