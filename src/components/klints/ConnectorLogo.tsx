import { cn } from "@/lib/utils";

export const CONNECTOR_LOGOS = {
  manago_ai: "/logo-manago.png",
  shopify: "/shopify-logo.png",
} as const;

type ConnectorLogoKey = keyof typeof CONNECTOR_LOGOS;

type ConnectorLogoProps = {
  name: ConnectorLogoKey;
  className?: string;
};

/** Equal-size brand marks for Manago / Shopify — no border chrome. */
export function ConnectorLogo({ name, className }: ConnectorLogoProps) {
  const src = CONNECTOR_LOGOS[name];
  const isManago = name === "manago_ai";

  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg",
        isManago && "bg-black",
        className,
      )}
    >
      <img
        src={src}
        alt=""
        className={cn("h-full w-full object-contain", isManago ? "p-1.5" : "p-1")}
      />
    </div>
  );
}
