import { StatusBadge } from "@/components/workspace";
import { taskStatusLabel, taskStatusTone } from "./speaker-task-model";


export function SpeakerTaskStatusBadge({ status }: Readonly<{ status: string }>) {
  return <StatusBadge tone={taskStatusTone(status)}>{taskStatusLabel(status)}</StatusBadge>;
}
