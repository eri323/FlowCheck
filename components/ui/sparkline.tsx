type SparklineProps = {
  data: number[];
  className?: string;
  width?: number;
  height?: number;
};

/**
 * Mini-gráfico de tendencia. Dibuja una polilínea + área sobre datos reales.
 * Si hay menos de 2 puntos no renderiza nada (el llamador decide el fallback).
 */
export function Sparkline({
  data,
  className,
  width = 120,
  height = 32,
}: SparklineProps): React.JSX.Element | null {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = points.join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const gradientId = `spark-${data.length}-${Math.round(max)}`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
