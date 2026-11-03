# Sofia OS Android 0.3.66 — initialization critical path

Based on exact 0.3.65 source edb7f80a2ad313618b5ece47d078e2a0ae7fe2ed. Package com.avsord.sofiaapp, versionCode 71, existing signature and update channel.

- Prepare the existing Android Keystore handle on a serial I/O worker from Application.onCreate, concurrently with React/Hermes startup. The module uses that same worker. Encryption, scopes, files and authentication storage are unchanged.
- Seed the pager from the existing native safe-area metrics so Home mounts in the first commit, not after an empty layout round trip. Actual viewport/content measurements still gate visibility and gestures; stale metrics and early menu taps are covered by executable component tests.
- Do not start native zero-to-zero animations for initially closed sheets. Existing entrance/exit transitions remain intact.

The manual production-APK smoke compares five offline cold starts against the exact previous 0.3.65 APK, then checks in-place installation, saved Home agenda, first chat menu tap and older-message pagination. Unit tests and Android compilation are separate from this measurement. No physical-device latency is presumed, and no millisecond guarantee is asserted before evidence. The native readiness signals and reportFullyDrawn boundary are unchanged.

Delivery route: [manual-apk], without official updater publication. No backend, account, history, page, database or server-deployment changes. Never uninstall or clear storage to upgrade.
