# Changelog

## Unreleased

### Added

- Added a camera-first Demo workflow for rendering and scanning Cimbar frames.
- Added Worker-backed frame decoding with RGBA-to-BGRA conversion for the OpenCV/WASM boundary.
- Added recovery progress, decoded-file download, and distinct invalid-frame diagnostics.
- Added automated tests for encoding input transfer, camera frame capture, Worker dispatch, decoded chunk handling, and native decode errors.

### Notes

- Static image upload remains a Demo convenience feature and is not part of the primary camera-scan test contract.
- User screenshots and generated validation images are intentionally excluded from the repository.
