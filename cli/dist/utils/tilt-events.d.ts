export type TiltTimelineKind = "running" | "failed" | "warning" | "success" | "status";
export interface TiltResourceSummary {
    name: string;
    runtimeStatus?: string;
    updateStatus?: string;
    hasPendingChanges?: boolean;
}
export interface TiltTimelineEvent {
    id: string;
    resourceName: string;
    kind: TiltTimelineKind;
    title: string;
    occurredAt?: string;
    details?: string;
}
export interface TiltEventSnapshot {
    resources: TiltResourceSummary[];
    events: TiltTimelineEvent[];
}
export type TiltEventsFailureKind = "unavailable" | "error";
export declare class TiltEventsLoadError extends Error {
    readonly kind: TiltEventsFailureKind;
    constructor(message: string, kind: TiltEventsFailureKind);
}
export declare function stripTerminalControls(value: string): string;
export declare function parseTiltUiResourceList(value: unknown): TiltEventSnapshot;
export declare function loadTiltEvents(): Promise<TiltEventSnapshot>;
