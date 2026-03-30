import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "category",
      label: "Getting Started",
      items: ["introduction"],
    },
    {
      type: "category",
      label: "Reference",
      items: ["specification", "design-brief"],
    },
    {
      type: "category",
      label: "Guides",
      items: ["contributing"],
    },
    {
      type: "category",
      label: "Agent",
      items: ["agent/operating-manual"],
    },
  ],
};

export default sidebars;
