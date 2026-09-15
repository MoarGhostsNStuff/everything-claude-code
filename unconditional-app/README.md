# Unconditional

Love, Wellness & Mental Health Companion — PWA + Native iOS/Mac App.

## Features

- **Medication Tracking** — Add, edit, schedule, and track medications with reminders at adjustable times
- **Sleep Detection** — Uses device motion + time patterns to predict when you're falling asleep, with self-improving accuracy from your feedback
- **Bedtime Routines** — Anger checks, "I love you" reminders, configurable countdown timers
- **Mental Health Check-ins** — Gigi wellness checks at 10 AM, 7 PM, and midnight
- **Harmony Monitor** — Ambient audio level detection that triggers supportive actions (plays Mac Miller, sends texts)
- **Happiness Points** — Gamified tracking (+100 for saying "I love you", +10 for taking meds, +50 for Gigi doing great)
- **Love Reminders** — Automated bedtime texts to configured contacts
- **Countdown Timers** — Visible countdowns for sleep predictions and reminders
- **Cinematic Splash Screen** — 6-second animated sequence with personal greetings
- **Native Haptics** — Vibration feedback on iOS for key interactions
- **Native Notifications** — Scheduled local notifications for meds and check-ins on iOS

## Quick Start (PWA — works immediately)

```bash
cd unconditional-app
npm install
npm start
```

Open `http://localhost:3456` on your phone. Tap "Share" > "Add to Home Screen" to install.

## Native App Setup (iOS + Mac)

### Prerequisites

1. **Mac with Xcode 15+** installed from the App Store
2. **Node.js 18+** — download from nodejs.org
3. **CocoaPods** — install via Terminal:
   ```bash
   sudo gem install cocoapods
   ```

### Step-by-Step Build

```bash
# 1. Clone the repo and enter the app directory
git clone https://github.com/moarghostsnstuff/everything-claude-code.git
cd everything-claude-code/unconditional-app

# 2. Install dependencies
npm install

# 3. Generate app icons
npm run icons

# 4. Run the automated native build script
npm run build:native

# 5. Open in Xcode
npx cap open ios
```

### In Xcode (iPhone)

1. Select your Apple Developer team under **Signing & Capabilities**
2. Bundle ID should be `com.unconditional.app`
3. In the device toolbar at top, select your connected iPhone 14 Pro Max
4. Press **Cmd+R** to build and run

### In Xcode (Mac — Catalyst)

1. Go to **General > Deployment Info**
2. Check **"Mac (Designed for iPad)"**
3. In the device toolbar, select **"My Mac (Designed for iPad)"**
4. Press **Cmd+R** to build and run as a Mac app

### Installing on iPhone (first time)

After the first build, your iPhone may show an "Untrusted Developer" warning:

1. On your iPhone, go to **Settings > General > VPN & Device Management**
2. Find your developer certificate and tap **Trust**
3. Re-launch the app

### Updating After Code Changes

```bash
npx cap sync ios
# Then Cmd+R in Xcode
```

## What Works Natively vs. PWA

| Feature | PWA | Native iOS |
|---------|-----|------------|
| Medication tracking | Yes | Yes |
| Sleep detection (motion) | Partial (needs permission tap) | Yes (automatic) |
| Local notifications | Browser-level | Native iOS notifications |
| Haptic feedback | No | Yes (vibration on actions) |
| Audio monitor | Yes | Yes |
| SMS links | Opens SMS app | Opens Messages app |
| Background check-ins | Only when app is open | Scheduled via iOS |
| Splash screen | CSS animation | CSS animation + native splash |
| Offline support | Service worker cache | Built-in (no network needed) |
| Mac support | Via browser | Mac Catalyst app |

## Architecture

- `index.html` — App shell with all views and splash screen
- `styles.css` — Dark theme with purple/orange, animations
- `app.js` — App logic + Capacitor native bridge layer
- `sw.js` — Service worker for offline/push (PWA mode)
- `manifest.json` — PWA manifest
- `capacitor.config.json` — Capacitor native configuration
- `build-native.js` — Automated build script (icons, iOS setup, Info.plist patching)
- `generate-icons.js` — SVG to PNG icon generation

## Privacy

All data stays on-device in localStorage. Audio monitoring processes sound levels locally and does not record or transmit audio. Motion data is used only for sleep prediction. No data is sent to any server.
