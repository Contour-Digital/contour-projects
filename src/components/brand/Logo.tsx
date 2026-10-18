import clsx from "clsx";

// Full horizontal wordmark (1200×191). Width follows the given height.
export function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/contour-digital-wordmark.png" alt="Contour Digital" width={1200} height={191} className={clsx("h-7 w-auto", className)} />
  );
}

// The mark on its own, for tight spots.
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/contour-digital-mark.svg" alt="Contour Digital" width={119} height={130} className={clsx("h-7 w-auto", className)} />
  );
}
