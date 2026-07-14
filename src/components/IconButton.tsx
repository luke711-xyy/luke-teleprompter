import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  compact?: boolean;
}

export function IconButton({ icon, label, compact = false, className = "", ...props }: IconButtonProps) {
  return (
    <button className={`icon-button ${compact ? "icon-button--compact" : ""} ${className}`} {...props}>
      <span className="icon-button__icon" aria-hidden="true">{icon}</span>
      <span className="icon-button__label">{label}</span>
    </button>
  );
}
