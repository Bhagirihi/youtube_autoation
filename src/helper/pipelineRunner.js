/**
 * Run a step-based pipeline with resume support.
 * Shared by pipelines that have ordered steps (e.g. HorrorPodcastAdda).
 *
 * @param {Object} options
 * @param {string[]} options.stepOrder - Ordered step names, e.g. ["story", "tts", "images", ...]
 * @param {() => Promise<{ resumeFrom: string, payload: any } | null>} options.getResumableState - Returns first step to run and initial payload, or null for full run
 * @param {Record<string, (payload: any) => Promise<any>>} options.steps - Map of step name → async (payload) => newPayload
 * @param {(payload: any) => Promise<void>} [options.onComplete] - Called after all steps with final payload
 * @param {number} [options.delayBetweenSteps=2000] - Ms to wait between steps
 * @param {(step: string) => void} [options.logStep] - Optional logger per step (e.g. logBox)
 * @returns {Promise<any>} Final payload after all steps
 */
export async function runPipelineWithResume({
  stepOrder,
  getResumableState,
  steps,
  onComplete,
  delayBetweenSteps = 2000,
  logStep,
}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let resumeFrom = null;
  let payload = null;

  const resume = await getResumableState();
  if (resume) {
    resumeFrom = resume.resumeFrom;
    payload = resume.payload;
    if (logStep) logStep(`Resuming from: ${resumeFrom}`);
    await sleep(500);
  }

  const fromIdx = resumeFrom ? stepOrder.indexOf(resumeFrom) : 0;
  const startIdx = fromIdx >= 0 ? fromIdx : 0;

  for (let i = startIdx; i < stepOrder.length; i++) {
    const stepName = stepOrder[i];
    const run = steps[stepName];
    if (!run) continue;
    if (logStep) logStep(stepName);
    payload = await run(payload);
    await sleep(delayBetweenSteps);
  }

  if (onComplete && payload) await onComplete(payload);
  return payload;
}

/**
 * Helper: should we run this step given resume point?
 * @param {string|null} resumeFrom - First step to run (null = run all)
 * @param {string} step - Step name
 * @param {string[]} stepOrder - Ordered step names
 */
export function shouldRunStep(resumeFrom, step, stepOrder) {
  if (!resumeFrom) return true;
  const idx = stepOrder.indexOf(step);
  const fromIdx = stepOrder.indexOf(resumeFrom);
  return idx >= 0 && fromIdx >= 0 && idx >= fromIdx;
}
