import { readSubagentsConfig } from '../config.js';
import { resolveContinuationEffectiveMode } from '../continuation-mode.js';
import type { SubagentTask } from '../types.js';
import { renderSubagentRunResult, renderSubagentTaskCall } from './subagent-run.js';

export function renderSubagentContinueCall(args: any, theme: any, task?: SubagentTask, cwd = process.cwd()) {
  const attempt = task ? (task.attempt ?? 1) + 1 : 'next';
  const detail = `continue · attempt: ${attempt} · id: ${args.task_id ?? 'unknown'}`;
  const mode = resolveContinuationEffectiveMode({ explicitMode: args?.mode, previousTask: task, config: readSubagentsConfig(cwd) });
  return renderSubagentTaskCall(task?.agent ?? 'continue', mode, theme, detail);
}

export function renderSubagentContinueResult(result: any, options: any, theme: any) {
  return renderSubagentRunResult(result, options, theme);
}
