import React from 'react';
import { FirestoreErrorInfo } from '../firebase.ts';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  firestoreInfo: FirestoreErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      firestoreInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let parsedInfo: FirestoreErrorInfo | null = null;
    try {
      const candidate = JSON.parse(error.message) as FirestoreErrorInfo;
      if (candidate && typeof candidate.operationType === 'string') {
        parsedInfo = candidate;
      }
    } catch {
      // Standard runtime error
    }

    return {
      hasError: true,
      message: parsedInfo ? parsedInfo.error : error.message,
      firestoreInfo: parsedInfo,
    };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] flex items-center justify-center p-6"
      >
        <div className="max-w-lg w-full bg-white rounded-xl shadow-md border border-[#c6c6cd] p-6 space-y-4">
          <div className="flex items-center gap-2 text-[#ba1a1a] font-semibold text-sm uppercase tracking-wider">
            <span>CivicResolve Diagnostics</span>
          </div>
          <h1 className="text-xl font-bold">
            {this.state.firestoreInfo
              ? 'Cloud Firestore Permission or Sync Error'
              : 'Application Error'}
          </h1>
          <p className="text-sm text-[#45464d]">{this.state.message}</p>
          {this.state.firestoreInfo && (
            <div className="bg-[#eff4ff] rounded-lg p-3 text-xs font-mono text-[#0b1c30] space-y-1">
              <div>Operation: {this.state.firestoreInfo.operationType}</div>
              <div>Path: {this.state.firestoreInfo.path ?? 'n/a'}</div>
              <div>
                Signed-in User:{' '}
                {this.state.firestoreInfo.authInfo.email ?? 'Unauthenticated'}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '', firestoreInfo: null })}
            className="px-4 py-2 rounded-lg bg-[#006398] text-white text-sm font-semibold hover:bg-[#00476e]"
          >
            Dismiss & Retry
          </button>
        </div>
      </div>
    );
  }
}
