"use client";
import { AlertTriangle, ArrowUpRight, CircleGauge, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import styles from "./organizer-review-overview.module.css";
import type { OrganizerReviewOverviewController } from "./organizer-review-overview-controller";
export function OrganizerReviewSummary({
  controller,
}: Readonly<{ controller: OrganizerReviewOverviewController }>) {
  const {
    planName,
    planStatusLabel,
    description,
    metrics,
    completionPercent,
    attentionSummary,
    onOpenPlan,
    onOpenReviewers,
  } = controller;
  return (
    <>
      <header className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.kickerRow}>
            <span>Review operations</span>
            <Badge variant="outline">{planStatusLabel}</Badge>
          </div>
          <h2 id="review-overview-title">{planName}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" onClick={onOpenReviewers} data-action="open-reviewers">
            <Users data-icon="inline-start" aria-hidden="true" />
            Reviewers
          </Button>
          <Button onClick={onOpenPlan} data-action="open-plan">
            Review plan
            <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </div>
      </header>
      <section className={styles.summaryGrid} aria-label="Review plan summary">
        <Card className={styles.metricsCard}>
          <CardHeader className={styles.cardHeader}>
            <CardTitle>Plan pulse</CardTitle>
            <CircleGauge aria-hidden="true" />
          </CardHeader>
          <CardContent className={styles.metrics}>
            {metrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </div>
            ))}
            <div className={styles.overallProgress}>
              <span>Overall progress</span>
              <strong>{completionPercent}%</strong>
              <Progress
                value={completionPercent}
                aria-label="Overall review completion"
                aria-valuetext={`${completionPercent}% complete`}
              />
            </div>
          </CardContent>
        </Card>
        <button
          className={styles.attentionSummary}
          type="button"
          onClick={onOpenReviewers}
          data-action="open-reviewers"
        >
          <span className={styles.attentionIcon}>
            <AlertTriangle aria-hidden="true" />
          </span>
          <span>
            <small>Attention queue</small>
            <strong>
              {attentionSummary.count} {attentionSummary.label}
            </strong>
            <span>{attentionSummary.description}</span>
          </span>
          <ArrowUpRight className={styles.summaryArrow} aria-hidden="true" />
        </button>
      </section>
    </>
  );
}
