import type { StatusValue } from "../types/index.js";
export declare function formatCount(count: number, singular: string, plural?: string): string;
export declare function formatDate(timestamp: string): string;
export declare function formatShortDate(timestamp: string): string;
export declare function getStatusColor(status: StatusValue): string;
export declare function getStatusIcon(status: StatusValue): string;
export declare function colorizeByStatus(text: string, status: StatusValue): string;
type EmptyStateItemType = "resources" | "stacks" | "services" | "stack-services";
export declare function showEmptyState(itemType: EmptyStateItemType, filterContext?: string, typeFilter?: string): void;
export declare function showCancelled(message?: string): void;
export declare function showCommandHeader(title: string): void;
export declare function showAllSatisfyCondition(items: string, condition: string): void;
/** Default width for ASCII boxes */
export declare const DEFAULT_BOX_WIDTH = 62;
export declare function formatBoxLine(char?: string, width?: number): string;
export declare function formatCentered(text: string, width?: number): string;
export declare function formatPadded(text: string, width: number): string;
export declare function truncate(str: string, maxLength: number): string;
export declare function showSuccess(message: string): void;
export declare function showStep(message: string): void;
export declare function showDetail(message: string, indent?: number): void;
export declare function formatBytes(bytes: number): string;
/**
 * Print a boxed header with title and optional subtitle.
 * Consolidates common box formatting patterns from networks.ts and other commands.
 * @param title - The main title to display
 * @param subtitle - Optional subtitle (e.g., domain info)
 * @param width - Box width (defaults to DEFAULT_BOX_WIDTH)
 */
export declare function printBoxedHeader(title: string, subtitle?: string, width?: number): void;
export {};
