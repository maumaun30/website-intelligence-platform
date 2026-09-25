export interface SparklinePoint {
  label: string;
  value: number;
}

const WIDTH = 240;
const HEIGHT = 64;
const PAD = 5;

/** The score band boundaries, drawn as quiet guides so a line can be read against them. */
const GUIDES = [90, 70];

/**
 * A single-series trend on a fixed 0–100 scale, so a site's line is comparable over time. The line
 * is recessive (muted ink); only the latest point takes the primary ink. Each point has a hover
 * title and the full series is repeated in a visually hidden table.
 */
export function Sparkline({ points, label }: { points: SparklinePoint[]; label: string }) {
  if (points.length === 0) {
    return null;
  }

  const x = (index: number) =>
    points.length === 1 ? WIDTH / 2 : PAD + (index * (WIDTH - PAD * 2)) / (points.length - 1);
  const y = (value: number) => PAD + ((100 - value) / 100) * (HEIGHT - PAD * 2);
  const coordinates = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const lastIndex = points.length - 1;

  return (
    <figure className="m-0 flex min-w-0 flex-1 flex-col gap-1.5">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
      >
        {GUIDES.map((guide) => (
          <line
            key={guide}
            x1={0}
            x2={WIDTH}
            y1={y(guide)}
            y2={y(guide)}
            stroke="currentColor"
            strokeDasharray="3 3"
            className="text-border"
          />
        ))}
        {points.length > 1 ? (
          <polyline
            points={coordinates}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="text-muted-foreground"
          />
        ) : null}
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={x(index)} cy={y(point.value)} r={8} fill="transparent">
              <title>{`${point.label}: ${point.value}`}</title>
            </circle>
            {index === lastIndex ? (
              <circle
                data-latest="true"
                cx={x(index)}
                cy={y(point.value)}
                r={4}
                fill="currentColor"
                stroke="var(--background)"
                strokeWidth={2}
                className="pointer-events-none text-primary"
              />
            ) : null}
          </g>
        ))}
      </svg>
      <figcaption className="flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>{points[0]!.label}</span>
        <span>{points[points.length - 1]!.label}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Audit</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={`${point.label}-${index}`}>
              <td>{point.label}</td>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
