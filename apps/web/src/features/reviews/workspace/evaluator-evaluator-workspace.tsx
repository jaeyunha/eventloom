"use client";
import { useEvaluatorController } from "./evaluator-controller";
import type { EvaluatorWorkspaceProps } from "./evaluator-state";
import { EvaluatorWorkspaceView } from "./evaluator-workspace-view";
export function EvaluatorWorkspace(props: Readonly<EvaluatorWorkspaceProps>) {
  return <EvaluatorWorkspaceView controller={useEvaluatorController(props)} />;
}
