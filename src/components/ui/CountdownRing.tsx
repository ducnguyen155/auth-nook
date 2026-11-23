interface CountdownRingProps {
  remaining: number;
  total: number;
  size?: number;
}

export function CountdownRing({ remaining, total, size = 28 }: CountdownRingProps) {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, remaining / total));
  const offset = circumference * (1 - ratio);
  const urgent = remaining <= 5;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-200 dark:text-zinc-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-300 ${
            urgent ? 'text-amber-500' : 'text-indigo-500'
          }`}
        />
      </svg>
      <span
        className={`absolute text-[10px] font-semibold tabular-nums ${
          urgent ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-400'
        }`}
      >
        {remaining}
      </span>
    </div>
  );
}
