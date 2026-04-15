# Changelog

## 0.0.1

- Initial scaffold of the `@airtrafficcontrol/e2e` package.
- Playwright (Chromium) runner configured to boot the daemon against a
  scratch profile and exercise the built web bundle via `vite preview`.
- Smoke suite covering project creation, craft lifecycle navigation, and
  the settings pages.
- Screenshot suite that seeds a deterministic dataset and captures the
  dashboard and craft detail views for use in repository documentation.
