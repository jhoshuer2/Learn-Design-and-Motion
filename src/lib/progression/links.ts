export type NextStep = { lessonId: string; title: string } | { assignmentId: string; title: string };

export const nextHref = (n: NextStep) =>
  "lessonId" in n ? `/learn/lesson/${n.lessonId}` : `/learn/assignment/${n.assignmentId}`;
