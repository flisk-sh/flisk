// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// What the agent does with a run it finds left in the middle when it starts. Kept apart from server.mjs so it can be tested
// without starting the server.

/**
 * `run` is the saved run record, `state` the LangGraph state of its thread (values, next, tasks).
 *  - "start": the run died before LangGraph's first checkpoint, so it starts from the goal
 *  - "done": the graph had already reached its end, so the run is only marked done
 *  - "resume-with-decision": the run is stopped at interrupt() and the human's answer is saved on the record but the
 *    checkpoint does not hold it yet (the agent died in between), so the saved answer is given to LangGraph again
 *  - "continue": pick the run up from its last checkpoint
 */
export function recoveryPlan(run, state) {
  if (!state?.values?.goal) return "start";
  if (!state.next || state.next.length === 0) return "done";
  const waiting = (state.tasks ?? []).some((task) => (task.interrupts ?? []).length > 0);
  if (waiting && run.decision) return "resume-with-decision";
  return "continue";
}
