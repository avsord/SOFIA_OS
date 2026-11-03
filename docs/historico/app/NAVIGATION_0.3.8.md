# Android navigation — 0.3.8

Scope: Android menu navigation only. No backend, authentication, persisted preferences, private-filter, storage keys, package identifier, signing configuration or historical documents are changed.

Menu taps issue `scrollTo({animated:false})` to the native horizontal pager before updating React selection. There is no waiting for a network request, animation, timer or page remount. The six main screens remain mounted at their normal viewport size. Screen components and callback props are memoized, so unchanged screens do not re-render on every menu selection. This removes the prior `display:none`/full-layout-toggle path.

Horizontal drags use the platform ScrollView pager rather than a JavaScript PanResponder. The order is Início, Conversa, Páginas, Agenda, Apps, Perfil. The pager follows the finger and snaps to a menu; a tap jumps directly without scrolling across intermediate menus. Notifications remain a separate overlay, with touch and accessibility focus disabled while hidden. Recording/response locks and an open keyboard disable swiping, as before. Stale momentum callbacks cannot override a later menu tap.

Android remains `com.avsord.sofiaapp`, versionCode 13, version 0.3.8, release prefix `sofia-android-v`. No new dependency is required. The existing workflow normalizes package-lock version metadata before npm ci, checks all TypeScript, runs application/navigation tests, builds the signed internal APK, and performs `adb install -r` over the published 0.3.6 before publishing. The existing development signing configuration is unchanged.

Local checks cover 14 navigation tests and syntax parsing of the four changed TypeScript files. The existing cached-Pages regression additionally runs in CI against the complete repository. Full type validation and the actual APK upgrade/launch must be confirmed from the workflow before claiming the release is available. The emulator smoke test covers upgrade and opening the login screen, not an authenticated interaction/performance measurement on the user's phone.
