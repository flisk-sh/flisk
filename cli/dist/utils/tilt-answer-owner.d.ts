/**
 * Whether a Tilt answer (from `tilt get uiresources`) came from another project.
 * A foreign Tilt is detected when it names no resource of this project: a Tilt that is
 * answering but running a different stack.
 * Returns false for inconclusive answers: unparseable, no items, only platform resources.
 */
export declare function tiltAnswerIsForeign(resources: unknown, projectResourceNames: Set<string>): boolean;
