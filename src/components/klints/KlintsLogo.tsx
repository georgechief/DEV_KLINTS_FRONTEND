import { Link } from "@tanstack/react-router";

type KlintsLogoProps = {
  variant?: "wordmark" | "mark";
  tone?: "dark" | "light";
  className?: string;
  /** Pass `false` to render without a link */
  to?: "/signin" | "/signup" | "/dashboard" | false;
};

const SRC = {
  wordmark: {
    dark: "/klints-logo.svg",
    light: "/klints-logo-light.svg",
  },
  mark: {
    dark: "/klints-mark.svg",
    light: "/klints-mark-light.svg",
  },
} as const;

export function KlintsLogo({
  variant = "wordmark",
  tone = "dark",
  className = "",
  to = "/signin",
}: KlintsLogoProps) {
  const src = SRC[variant][tone];
  const img = (
    <img
      src={src}
      alt="Klints"
      className={
        variant === "wordmark"
          ? `h-7 w-auto ${className}`
          : `h-8 w-auto ${className}`
      }
    />
  );

  if (to === false) return img;

  return (
    <Link to={to} className="inline-flex items-center" aria-label="Klints">
      {img}
    </Link>
  );
}
