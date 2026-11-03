# Sofia Android 0.3.9 — response at touch-down and finger-driven paging

The fixed menu bar now dispatches navigation in onPressIn with zero intentional press delay. A physical finger-up does not dispatch again, so a release from an earlier touch cannot undo a later selection. Keyboard and explicit accessibility activations remain available. Touch-down navigation is NOT applied to scrollable page rows, where it would open a page accidentally as the user begins scrolling.

The horizontal native ScrollView remains responsible for following the finger and settling onto the neighboring page. No JavaScript per-frame animation is used. Content/layout callbacks now refuse to issue a corrective scroll while a drag or its momentum is in progress. An explicit menu tap cancels that gesture selection and jumps with animated:false. Pages have fixed viewport width and flexShrink:0. Existing recording, keyboard, navigation-history and notification-overlay behavior are retained.

Page-body JSON is prepared in an in-memory, component-scoped cache when the page entity list changes; opening a cached page does not wait for a fresh request or reparse its JSON. This is not persistent storage and adds no auth/private-filter migration. Saving still invalidates the cache through the updated entity list.

Local validation: 23 TS/TSX source files parsed; 9 existing chat-model tests and 29 navigation tests passed (38 total). The added interaction tests call the actual component callbacks using hook/native-view stubs, including touch-down before finger-up, rapid taps, accessibility, content changes during drag, momentum and tap interruption. These tests are not an Android pixel-latency benchmark and do not establish measured performance on the user's physical phone. Full TypeScript validation and APK upgrade/launch are required CI stages before publication.

Version: 0.3.9; Android versionCode: 14; package: com.avsord.sofiaapp; release prefix: sofia-android-v. No new native dependency, signing change, backend/password/private-filter change, storage-key change or historical-document removal. The existing source-normalization stage updates the package-lock version metadata before npm ci.
