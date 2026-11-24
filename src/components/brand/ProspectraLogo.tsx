import { cn } from "@/lib/utils";

type ProspectraLogoProps = {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizeMap = {
  sm: { mark: "h-7 w-7", text: "text-base" },
  md: { mark: "h-9 w-9", text: "text-lg" },
  lg: { mark: "h-12 w-12", text: "text-2xl" },
} as const;

export function ProspectraLogo({ className, showWordmark = true, size = "md" }: ProspectraLogoProps) {
  const dims = sizeMap[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        className={cn(dims.mark, "shrink-0")}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={showWordmark}
        role={showWordmark ? undefined : "img"}
        aria-label={showWordmark ? undefined : "Prospectra"}
      >
        <rect width="64" height="64" rx="14" className="fill-brand-navy dark:fill-brand-electric" />
        <path
          d="M18 42V22h14.2c6.1 0 10.1 3.4 10.1 8.6 0 5.3-4 9.1-10.3 9.1H27v2.3H18zm9.5-8.6h4.8c2.9 0 4.6-1.5 4.6-4s-1.7-3.9-4.6-3.9h-4.8v7.9z"
          fill="white"
        />
        <path d="M44 20l8 6-8 6V20z" className="fill-brand-electric dark:fill-white" />
      </svg>
      {showWordmark ? (
        <span className={cn("font-display font-semibold tracking-tight text-brand-navy dark:text-white", dims.text)}>
          Prospectra
        </span>
      ) : null}
    </span>
  );
}
