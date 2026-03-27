import { Link } from "react-router";

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  crumbs: Crumb[];
  right?: React.ReactNode;
}

export function PageHeader({ crumbs, right }: PageHeaderProps) {
  return (
    <div
      className="flex h-12 items-center justify-between border-b px-5"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="mx-1" style={{ color: "var(--text-dim)" }}>
                /
              </span>
            )}
            {crumb.to ? (
              <Link
                to={crumb.to}
                className="no-underline hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {crumb.label}
              </Link>
            ) : (
              <span style={{ color: "var(--text-primary)" }}>{crumb.label}</span>
            )}
          </span>
        ))}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
