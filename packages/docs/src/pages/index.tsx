import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import styles from "./index.module.css";

const features = [
  {
    icon: "✈️",
    title: "Craft Management",
    description:
      "Every change is a craft with a callsign, cargo, and flight plan. Full lifecycle from filing to landing.",
  },
  {
    icon: "🗼",
    title: "Tower Coordination",
    description:
      "A single tower per repo manages landing clearance, conflict detection, and merge sequencing.",
  },
  {
    icon: "📦",
    title: "Black Box Logging",
    description:
      "Append-only event logs on every craft capture decisions, state transitions, and audit trails.",
  },
];

export default function Home(): React.JSX.Element {
  return (
    <Layout description="Agent orchestration with aviation precision">
      <header className={styles.hero}>
        <div className={styles.radarSweep} />
        <div className={styles.heroInner}>
          <h1 className={styles.title}>ATC</h1>
          <p className={styles.subtitle}>Air Traffic Control for Agents</p>
          <p className={styles.tagline}>
            Coordinate autonomous agents with aviation precision
          </p>
          <div className={styles.buttons}>
            <Link className={styles.primaryButton} to="/docs">
              Read the Docs
            </Link>
            <Link
              className={styles.secondaryButton}
              to="/docs/specification"
            >
              View Specification
            </Link>
          </div>
        </div>
      </header>
      <section className={styles.features}>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <div key={feature.title} className={styles.featureCard}>
              <div className={styles.featureIcon}>{feature.icon}</div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDescription}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}
