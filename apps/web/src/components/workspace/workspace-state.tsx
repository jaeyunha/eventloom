import { CircleAlert, Inbox } from "lucide-react";
import { type HTMLAttributes, type ReactNode, useId } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Separator,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import styles from "./workspace-state.module.css";

export type WorkspaceStateVariant = "empty" | "error";

export interface WorkspaceStateProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  readonly variant: WorkspaceStateVariant;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly action?: ReactNode;
}

export function WorkspaceState({
  variant,
  title,
  description,
  action,
  className,
  ...props
}: WorkspaceStateProps) {
  if (variant === "error") {
    return (
      <Alert className={cn(styles.errorState, className)} variant="destructive" {...props}>
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
        {action === undefined ? null : <AlertAction>{action}</AlertAction>}
      </Alert>
    );
  }

  return (
    <Empty className={cn(styles.emptyState, className)} {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>{description}</EmptyContent>
      {action === undefined ? null : <div className={styles.stateAction}>{action}</div>}
    </Empty>
  );
}

export interface WorkspaceFormSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
}

export function WorkspaceFormSection({
  title,
  description,
  action,
  className,
  children,
  ...props
}: WorkspaceFormSectionProps) {
  const generatedTitleId = useId();
  const titleId = props["aria-labelledby"] ?? generatedTitleId;

  return (
    <section aria-labelledby={titleId} className={cn(styles.formSection, className)} {...props}>
      <header className={styles.formHeader}>
        <div>
          <h2 className={styles.formTitle} id={titleId}>
            {title}
          </h2>
          {description === undefined ? null : (
            <p className={styles.formDescription}>{description}</p>
          )}
        </div>
        {action === undefined ? null : <div className={styles.formAction}>{action}</div>}
      </header>
      <div className={styles.formContent}>{children}</div>
    </section>
  );
}

export interface WorkspaceActionBarProps extends HTMLAttributes<HTMLElement> {
  readonly summary?: ReactNode;
  readonly actions: ReactNode;
}

export function WorkspaceActionBar({
  summary,
  actions,
  className,
  ...props
}: WorkspaceActionBarProps) {
  return (
    <section aria-label="Workspace actions" className={cn(styles.actionBar, className)} {...props}>
      <Separator className={styles.actionSeparator} />
      <div className={styles.actionContent}>
        {summary === undefined ? <span /> : <div aria-live="polite">{summary}</div>}
        <div className={styles.actions}>{actions}</div>
      </div>
    </section>
  );
}

export const FormSection = WorkspaceFormSection;

export const StickyActionBar = WorkspaceActionBar;
