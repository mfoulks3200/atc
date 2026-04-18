import type { SpotlightTour } from "../types";

export const firstRunTour: SpotlightTour = {
  id: "first-run",
  steps: [
    {
      id: "welcome",
      targetId: null,
      title: "Welcome to ATC",
      body: "ATC coordinates autonomous agents working on your code. Let's set up your first project.",
    },
    {
      id: "sidebar-projects",
      targetId: "sidebar-projects",
      title: "Start with a project",
      body: "Projects are the repos ATC manages. Click Projects in the sidebar to continue.",
      preferredSide: "right",
    },
    {
      id: "new-project",
      targetId: "projects-new-button",
      title: "Create your first project",
      body: "Point ATC at a local repo. You can use a scratch repo to try things out.",
      preferredSide: "bottom",
    },
    {
      id: "new-craft",
      targetId: "project-new-craft-button",
      title: "Launch your first craft",
      body: "A craft is a unit of work. Click New Craft when you're ready to assign a pilot.",
      preferredSide: "bottom",
    },
  ],
};
