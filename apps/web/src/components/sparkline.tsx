export interface SparklinePoint {
  label: string;
  value: number;
}

const WIDTH = 160;
const HEIGHT = 40;
const PAD = 5;

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
    <figure className="flex flex-col">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        className="overflow-visible"
      >
        {points.length > 1 ? (
          <polyline
            points={coordinates}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
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
