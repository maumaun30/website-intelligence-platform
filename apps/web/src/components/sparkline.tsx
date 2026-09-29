export interface SparklinePoint {
  label: string;
  value: number;
}

const WIDTH = 240;
const HEIGHT = 64;
const PAD = 4;

/** The score band boundaries, drawn as quiet guides so a line can be read against them. */
const GUIDES = [90, 70];

/**
 * A single-series trend on a fixed 0–100 scale, so a site's line is comparable over time and
 * across websites.
 *
 * The SVG stretches to the width it is given (`preserveAspectRatio="none"`), which is what lets a
 * short series span the card — but it also means anything with two dimensions is distorted. So
 * only strokes are drawn inside it, the latest point is an HTML dot positioned in percentages on
 * top, and the hover targets are full-height columns rather than circles.
 */
export function Sparkline({ points, label }: { points: SparklinePoint[]; label: string }) {
  if (points.length === 0) {
    return null;
  }

  const x = (index: number) =>
    points.length === 1 ? WIDTH / 2 : PAD + (index * (WIDTH - PAD * 2)) / (points.length - 1);
  const y = (value: number) => PAD + ((100 - value) / 100) * (HEIGHT - PAD * 2);
  const coordinates = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const last = points[points.length - 1]!;
  const columnWidth = WIDTH / points.length;

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div className="relative h-16 w-full">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          {GUIDES.map((guide) => (
            <line
              key={guide}
              x1={0}
              x2={WIDTH}
              y1={y(guide)}
              y2={y(guide)}
              stroke="currentColor"
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
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
            <rect
              key={`${point.label}-${index}`}
              x={Math.max(x(index) - columnWidth / 2, 0)}
              y={0}
              width={columnWidth}
              height={HEIGHT}
              fill="transparent"
            >
              <title>{`${point.label}: ${point.value}`}</title>
            </rect>
          ))}
        </svg>
        {/* Positioned in percentages outside the SVG so it stays round however wide the card is. */}
        <span
          data-latest="true"
          aria-hidden="true"
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
          style={{
            left: `${(x(points.length - 1) / WIDTH) * 100}%`,
            top: `${(y(last.value) / HEIGHT) * 100}%`,
          }}
        />
      </div>
      <figcaption className="flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>{points[0]!.label}</span>
        <span>{last.label}</span>
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
