export function KlintsLoader({
  label = "Loading…",
  fullScreen = true,
}: {
  label?: string;
  fullScreen?: boolean;
}) {
  const body = (
    <div
      className="relative flex h-24 w-24 items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span
        className="klints-loader-ring absolute inset-0 rounded-full border-2 border-spark/25"
        aria-hidden
      />
      <span
        className="klints-loader-ring-spin absolute inset-0 rounded-full border-2 border-transparent border-t-spark"
        aria-hidden
      />
      <div className="relative inline-flex items-center justify-center">
        <span
          className="klints-loader-dot absolute -right-1 top-1.5 h-3 w-3 rounded-full bg-spark"
          aria-hidden
        />
        <span className="font-display pr-2 text-5xl font-semibold leading-none tracking-tight text-ink">
          K
        </span>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );

  if (!fullScreen) {
    return <div className="flex min-h-[16rem] w-full items-center justify-center">{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sand/60 backdrop-blur-[1px]">
      {body}
    </div>
  );
}
