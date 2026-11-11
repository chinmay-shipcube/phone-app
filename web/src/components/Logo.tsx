/** The Cell Decor mark with the "CELL DECOR" wordmark, in the counter's navy and black. */
export function Logo({ size = 36, wordmark = true, light = false }: { size?: number; wordmark?: boolean; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        className={`shrink-0 ${light ? 'rounded-lg bg-white p-1' : ''}`}
        style={{ width: size, height: size }}
      />
      {wordmark ? (
        <span className="leading-none tracking-tight" style={{ fontSize: size * 0.55 }}>
          <span className={`font-black ${light ? 'text-white' : 'text-brand-700'}`}>CELL</span>{' '}
          <span className={`font-black ${light ? 'text-brand-100' : 'text-ink'}`}>DECOR</span>
        </span>
      ) : null}
    </span>
  );
}
