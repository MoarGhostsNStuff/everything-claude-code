# Unconditional

Love, Wellness & Mental Health Companion PWA.

## Features

- **Medication Tracking** - Add, edit, schedule, and track medications with reminders at adjustable times
- **Sleep Detection** - Uses device motion + time patterns to predict when you're falling asleep, with self-improving accuracy from your feedback
- **Bedtime Routines** - Anger checks, "I love you" reminders, configurable countdown timers
- **Mental Health Check-ins** - Gigi wellness checks at 10 AM, 7 PM, and midnight
- **Harmony Monitor** - Ambient audio level detection that triggers supportive actions
- **Happiness Points** - Gamified tracking (+100 for saying "I love you", etc.)
- **Love Reminders** - Automated bedtime texts to configured contacts
- **Countdown Timers** - Visible countdowns for sleep predictions and reminders

## Quick Start (PWA)

```bash
cd unconditional-app
npm install
npm start
```

Open `http://localhost:3000` on your phone and use "Add to Home Screen" to install as a PWA.

## Native App (Capacitor)

### Prerequisites
- Node.js 18+
- Xcode 15+ (for iOS/Mac)
- CocoaPods (`sudo gem install cocoapods`)

### Build for iOS / Mac

```bash
npm install
npx cap add ios
npx cap sync
npx cap open ios
```

In Xcode:
1. Select your team under Signing & Capabilities
2. Set the bundle identifier to `com.unconditional.app`
3. For Mac Catalyst: enable "Mac (Designed for iPad)" in General > Deployment Info
4. Build and run on your device

### Generate Icons

```bash
npm run icons
```

## Configuration

All settings are configurable in the Settings tab:
- Toggle sleep detection, sleep prompts, anger checks
- Toggle medication reminders, mental health check-ins
- Toggle audio monitor, love contract reminders
- Clear all data

## Architecture

- `index.html` - App shell with all views
- `styles.css` - Complete styling with purple/orange theme
- `app.js` - All app logic (storage, notifications, detection, timers)
- `sw.js` - Service worker for offline support and push notifications
- `manifest.json` - PWA manifest
- `capacitor.config.json` - Capacitor native app configuration
- `generate-icons.js` - Icon generation script

## Privacy

All data stays on-device in localStorage. Audio monitoring processes sound levels locally and does not record or transmit audio. Motion data is used only for sleep prediction.
