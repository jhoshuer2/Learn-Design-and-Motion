/**
 * A hard spend cap for calibration. Before each call it asks whether the call could push spend over the cap, using the
 * measured average cost so far (with headroom) once there is one, and a conservative estimate before that.
 */
export class Budget {
  spent = 0;
  calls = 0;
  constructor(readonly capUsd: number) {}
  record(costUsd: number) { this.spent += costUsd; this.calls++; }
  get average() { return this.calls ? this.spent / this.calls : 0; }
  /** The most the next call may plausibly cost. */
  projected(estimateUsd: number) { return Math.max(estimateUsd, this.average * 1.5); }
  canStart(estimateUsd: number) { return this.spent + this.projected(estimateUsd) <= this.capUsd; }
}
