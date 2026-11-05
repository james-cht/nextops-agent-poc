export interface DiagnosisError {
  id: string;
  service: string;
  message: string;
  detail?: string;
  timestamp: string;
  status: 'active' | 'resolved';
}

const errors: Map<string, DiagnosisError> = new Map();

export function registerError(service: string, message: string, detail?: string): DiagnosisError {
  // Find an existing active error for the service
  let activeError = Array.from(errors.values()).find(
    (e) => e.service === service && e.status === 'active'
  );

  if (activeError) {
    activeError.message = message;
    activeError.detail = detail;
    activeError.timestamp = new Date().toISOString();
    return activeError;
  } else {
    const id = Math.random().toString(36).substring(2, 11);
    const newError: DiagnosisError = {
      id,
      service,
      message,
      detail,
      timestamp: new Date().toISOString(),
      status: 'active'
    };
    errors.set(id, newError);
    return newError;
  }
}

export function clearError(service: string): void {
  // Marks an active error for a service as resolved
  for (const error of errors.values()) {
    if (error.service === service && error.status === 'active') {
      error.status = 'resolved';
    }
  }
}

export function getErrors(): DiagnosisError[] {
  // Returns all errors sorted by timestamp desc
  return Array.from(errors.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function clearAllErrors(): void {
  // Marks all errors as resolved
  for (const error of errors.values()) {
    error.status = 'resolved';
  }
}
