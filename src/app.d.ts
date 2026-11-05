/// <reference types="@sveltejs/kit" />

declare global {
  namespace App {
    interface Locals {
      requestId?: string;
      /** Operator key for personal prefs (username); null if unauthenticated tool path. */
      operatorKey?: string | null;
      /** Opaque Session id for the current request cookie. */
      sessionId?: string | null;
    }
  }
}

export {};
