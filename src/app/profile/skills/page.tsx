import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getSkillProfile, type SkillStatus } from "@/lib/progression/remediation";
import { StateBadge, type NodeState } from "@/components/ui/StateBadge";

const BADGE: Record<SkillStatus, { state: NodeState; label: string }> = {
  demonstrated: { state: "completed", label: "Demonstrated" },
  needs_improvement: { state: "failed", label: "Needs improvement" },
  not_assessed: { state: "locked", label: "Not assessed" },
};
const TIER = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

export default async function Skills() {
  const user = await requireUser();
  const skills = await getSkillProfile(user.id);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <nav className="text-sm"><Link href="/learn" className="underline">My learning</Link></nav>
      <h1 className="mt-4 font-display text-4xl">My skills</h1>
      <p className="mt-2 max-w-measure text-muted">
        Each skill is shown only from assessed evidence: knowledge checks and assessed work. A skill counts as demonstrated at a level when your latest result there is 80% or more.
        Time spent on the platform is never counted, and a skill with no evidence is shown as not assessed.
      </p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {skills.map((s) => (
          <li key={s.slug} className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-medium">{s.title}{s.critical && <span className="ml-2 text-sm font-normal text-muted">(required skill)</span>}</h2>
                <p className="text-sm text-muted">
                  {s.status === "not_assessed" ? "No evidence yet."
                    : `${s.status === "demonstrated" ? `Demonstrated at ${TIER(s.tier!)} level. ` : ""}Latest result ${s.latestScore}%. ${s.evidenceCount} piece${s.evidenceCount === 1 ? "" : "s"} of evidence (${s.quizEvidence} knowledge check, ${s.assessedEvidence} assessed work).`}
                </p>
              </div>
              <StateBadge state={BADGE[s.status].state} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
