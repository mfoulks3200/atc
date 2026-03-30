import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "category",
      label: "Getting Started",
      items: ["introduction", "getting-started"],
    },
    {
      type: "category",
      label: "Concepts",
      items: [
        "concepts/crafts",
        "concepts/pilots-and-seats",
        "concepts/craft-categories",
        "concepts/controls",
        "concepts/intercom",
        "concepts/vectors-and-flight-plans",
        "concepts/black-box",
        "concepts/tower",
        "concepts/origin-airport",
      ],
    },
    {
      type: "category",
      label: "Lifecycle",
      items: ["lifecycle/craft-lifecycle"],
    },
    {
      type: "category",
      label: "Protocols",
      items: [
        "protocols/vector-reporting",
        "protocols/landing-checklist",
        "protocols/emergency-declaration",
        "protocols/tower-merge-protocol",
      ],
    },
    {
      type: "category",
      label: "Reference",
      items: ["specification", "design-brief"],
    },
    {
      type: "category",
      label: "Guides",
      items: ["contributing", "agent/operating-manual"],
    },
  ],
};

export default sidebars;
