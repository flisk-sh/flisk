/**
 * The browser origins of a local Flisk stack's frontends (`app.<project>.localhost`, on any port). The frontend and the API
 * are on different `*.localhost` hosts, so a scaffolded API has to allow these origins before a browser can call it. The rule
 * is deliberately not `*`: only the developer's own local frontends get through.
 */
export declare const LOCAL_FRONTEND_ORIGIN_PATTERN: string;
/** The comment scaffolded next to the rule, so a developer knows why the API has CORS at all. */
export declare const LOCAL_FRONTEND_CORS_REASON = "The frontend runs on its own *.localhost origin (app.<project>.localhost), so the browser needs CORS to call this API.";
/** The JavaScript declaration of the rule, for the JS and TS backends. */
export declare function localFrontendOriginConst(): string;
