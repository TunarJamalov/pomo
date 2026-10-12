/*
 * The kitchen-timer scale from the Pomo logo (… 55 · 0 · 5 · 10 …), used as
 * the site's recurring motif: a straight ruler between sections and a round
 * dial in the closing call to action. Pure SVG.
 */

/** A horizontal strip of minute ticks with the "0" mark in tomato. */
export function TimerRuler({ className = "" }: { className?: string }) {
  const ticks = Array.from({ length: 121 }, (_, i) => i - 60); // -60..60 minutes
  const step = 12;
  const width = ticks.length * step;
  return (
    <div className={`overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox={`0 0 ${width} 44`} preserveAspectRatio="xMidYMid slice" className="h-11 w-full">
        {ticks.map((m, i) => {
          const x = i * step + step / 2;
          const major = m % 5 === 0;
          const zero = m === 0;
          const label = ((m % 60) + 60) % 60;
          return (
            <g key={m}>
              <line
                x1={x}
                x2={x}
                y1={major ? 4 : 10}
                y2={major ? 20 : 16}
                stroke={zero ? "var(--tomato)" : major ? "var(--site-subtle)" : "var(--site-line-strong)"}
                strokeWidth={zero ? 3 : major ? 1.5 : 1}
                strokeLinecap="round"
              />
              {major && (
                <text
                  x={x}
                  y={36}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="var(--font-code), monospace"
                  fill={zero ? "var(--tomato)" : "var(--site-subtle)"}
                  fontWeight={zero ? 700 : 400}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A round timer face with the first `minutes` of the hour marked in tomato. */
export function TimerDial({ minutes = 25, size = 280 }: { minutes?: number; size?: number }) {
  const c = 100;
  const r = 78;
  const circumference = 2 * Math.PI * r;
  const arc = (minutes / 60) * circumference;
  const hand = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className="h-auto max-w-full" aria-hidden="true">
      <circle cx={c} cy={c} r={96} fill="var(--site-surface)" stroke="var(--site-line)" />
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--tomato-soft)" strokeWidth="14" />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--tomato)"
        strokeWidth="14"
        strokeDasharray={`${arc} ${circumference}`}
        transform={`rotate(-90 ${c} ${c})`}
      />
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const major = i % 5 === 0;
        const r1 = major ? 58 : 62;
        return (
          <line
            key={i}
            x1={c + Math.cos(a) * r1}
            y1={c + Math.sin(a) * r1}
            x2={c + Math.cos(a) * 66}
            y2={c + Math.sin(a) * 66}
            stroke={major ? "var(--site-muted)" : "var(--site-line-strong)"}
            strokeWidth={major ? 1.6 : 1}
            strokeLinecap="round"
          />
        );
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return (
          <text
            key={i}
            x={c + Math.cos(a) * 47}
            y={c + Math.sin(a) * 47 + 3.5}
            textAnchor="middle"
            fontSize="9"
            fontFamily="var(--font-code), monospace"
            fill={i === 0 ? "var(--tomato)" : "var(--site-subtle)"}
          >
            {i * 5}
          </text>
        );
      })}
      <line
        x1={c}
        y1={c}
        x2={c + Math.cos(hand) * 40}
        y2={c + Math.sin(hand) * 40}
        stroke="var(--tomato)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx={c} cy={c} r={5} fill="var(--tomato)" />
    </svg>
  );
}
