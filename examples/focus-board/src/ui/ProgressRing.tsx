const CIRCUMFERENCE = 2 * Math.PI * 42;

/** Done/total ring. The stroke animates through a CSS transition, which the reduced-motion rule disables. */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const fraction = total === 0 ? 0 : done / total;
  return (
    <div className="progress-ring" role="img" aria-label={`${done} of ${total} done`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="bg" cx="50" cy="50" r="42" />
        <circle className="fg" cx="50" cy="50" r="42" style={{ strokeDasharray: CIRCUMFERENCE, strokeDashoffset: CIRCUMFERENCE * (1 - fraction) }} />
      </svg>
      <b aria-hidden="true">
        {done}/{total}
      </b>
    </div>
  );
}
