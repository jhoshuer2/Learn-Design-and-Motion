export type NextStep =
  | { lessonId: string; title: string }
  | { assignmentId: string; title: string }
  | { remediationFor: string; title: string }
  | { levelId: string; title: string };

export const nextHref = (n: NextStep) =>
  "lessonId" in n ? `/learn/lesson/${n.lessonId}`
  : "assignmentId" in n ? `/learn/assignment/${n.assignmentId}`
  : "remediationFor" in n ? `/learn/remediation/${n.remediationFor}`
  : `/learn/level/${n.levelId}`;
