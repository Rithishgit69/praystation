# Publishing — The Temple of Eka-Danta

Everything below was run on this machine except where marked **(needs your account)**.

## 0. Prerequisites

```bash
brew install openjdk@21 && brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-36" "build-tools;36.0.0"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
```

iOS additionally needs Xcode 16+ from the App Store (`xcode-select -s /Applications/Xcode.app`). Capacitor 8
uses Swift Package Manager: no CocoaPods.

## 1. Web / PWA

```bash
npm run build            # dist/ — offline-capable PWA (manifest + service worker precache)
npm run preview          # verify at http://127.0.0.1:4173
```

Host `dist/` on any static host over HTTPS. The service worker precaches every asset (≈4.5 MB), so the
game installs from the browser and plays fully offline. No runtime CDN calls are made.

## 2. Android — signed AAB

Release signing reads `android/keystore.properties` (git-ignored):

```
storeFile=keystore/upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

An upload keystore was generated at `android/keystore/upload.jks` with:

```bash
keytool -genkeypair -v -keystore android/keystore/upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Keep it and its passwords somewhere safe: Play App Signing will wrap your app key, but this upload key
is required for every later upload. Then:

```bash
npm run mobile:android   # → dist/app-release.aab (R8 minified, shrunk resources, signed)
```

Versioning: `android/app/build.gradle` uses `versionCode = major*10000 + minor*100 + patch` and
`versionName` mirrors `package.json`. Bump both for each release. The app ships no native libraries,
so it is 16 KB page-size compatible by construction; `targetSdk` and `compileSdk` are 36.

**Play Console (needs your account)**

1. Create the app: *The Temple of Eka-Danta*, game, free, no ads, no IAP.
2. Upload `dist/app-release.aab` to an internal testing track first.
3. Store listing: copy from `store/listing.md`; icon `store/icons/icon-1024.png`; feature graphic
   `store/feature-graphic.png`; screenshots `store/screenshots/*.png` (1920×1080, landscape).
4. **Data safety**: *Does your app collect or share user data?* → **No**. The game stores saves in
   local storage only; nothing leaves the device. No analytics, no crash reporting unless the player
   opts in (the toggle exists in Options but no third-party SDK is bundled, so even opted-in it sends nothing).
5. **Content rating (IARC)**: answer *Violence → fantasy violence against non-human/mythic creatures:
   yes; blood: no; gambling: no; controlled substances: no; user interaction: none*. Expected rating:
   **Teen / PEGI 12 / USK 12**.
6. Target audience: 13+. Ads declaration: none. App access: no login.
7. Roll out to production after internal testing.

## 3. iOS — Xcode project + TestFlight (needs a Mac with Xcode and your Apple Developer account)

```bash
npm run mobile:ios       # build → cap sync ios → opens ios/App/App.xcodeproj
```

In Xcode: select the *App* target → Signing & Capabilities → your team; bundle id `com.ekadanta.temple`;
set **Version** 1.0.0 / **Build** 1. Product → Archive → Distribute → App Store Connect → Upload.
Landscape-only, status bar hidden and full screen are already set in `ios/App/App/Info.plist`;
`ITSAppUsesNonExemptEncryption` is `false`. The app icon is a single 1024×1024 asset.

**App Store Connect metadata**: name, subtitle, description and keywords from `store/listing.md`;
category Games › Adventure; age rating: *Cartoon or Fantasy Violence: Infrequent/Mild* → **12+**.
**App Privacy (nutrition labels)**: *Data Not Collected*. Privacy policy URL: host `store/privacy.html`.
Add internal testers under TestFlight and submit the build.

## 4. Release checklist

- [ ] `npm run typecheck && npm run lint && npm test && npm run test:e2e` green
- [ ] `node tools/play-missions.mjs` completes all eight tasks with no console errors
- [ ] version bumped in `package.json`, `android/app/build.gradle`, Xcode
- [ ] `CHANGELOG.md` updated
- [ ] screenshots regenerated (`npm run screenshots` against `npm run preview`)
