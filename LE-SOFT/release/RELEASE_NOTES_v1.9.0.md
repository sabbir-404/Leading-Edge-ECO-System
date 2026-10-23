# LE-SOFT 1.9.0

## Improvements

- Added a superadmin-only License Generator in Settings that creates machine-bound v2 signed licenses. The signing key stays in the developer's protected local key store and is not bundled with the application.
- Corrected vertical alignment and clipping in the shared application title bar.
- Fixed the Place Order specification selector crashing when no catalog product is selected.

## Verification

- TypeScript and production renderer build passed.
- License generation and IPC authorization tests passed.
- Release installers and update metadata are built by the tagged GitHub Actions release workflow.
