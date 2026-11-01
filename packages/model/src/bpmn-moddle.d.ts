// bpmn-moddle liefert Typen nur unter "bpmn-moddle/types", nicht für den Haupteinstieg.
// Nach außen gibt das Paket nur die eigenen Typen aus states/types.ts weiter.
declare module 'bpmn-moddle' {
  import type { Moddle } from './states/types.js';

  export const BpmnModdle: new (
    additionalPackages?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Moddle;
}
