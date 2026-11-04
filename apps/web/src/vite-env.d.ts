/// <reference types="vite/client" />

/** `true` in der Web-App für den Webserver (PWA), `false` in der einzelnen Datei und beim Entwickeln. */
declare const __BESTBPMN_PWA__: boolean;
/** Version aus package.json, z. B. `0.1.0`. */
declare const __BESTBPMN_VERSION__: string;

/** bpmn-js-color-picker bringt keine Typen mit. */
declare module 'bpmn-js-color-picker' {
  const module: Record<string, unknown>;
  export default module;
}
