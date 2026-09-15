#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: __dirname });
};

console.log('\n=== Unconditional — Native Build Script ===\n');

// Step 1: Generate icons if missing
const icon192 = path.join(__dirname, 'icons', 'icon-192.png');
if (!fs.existsSync(icon192)) {
  console.log('Generating icons...');
  run('node generate-icons.js');
}

// Step 2: Add iOS platform if not present
const iosDir = path.join(__dirname, 'ios');
if (!fs.existsSync(iosDir)) {
  console.log('Adding iOS platform...');
  run('npx cap add ios');
} else {
  console.log('iOS platform already exists.');
}

// Step 3: Sync web assets to native project
console.log('\nSyncing web assets to native project...');
run('npx cap sync ios');

// Step 4: Configure iOS project for iPhone + Mac Catalyst
const iosAppDir = path.join(iosDir, 'App', 'App');
if (fs.existsSync(iosAppDir)) {
  // Copy app icons
  const assetCatalog = path.join(iosAppDir, 'Assets.xcassets', 'AppIcon.appiconset');
  if (fs.existsSync(assetCatalog)) {
    const sizes = [
      { size: 20, scales: [2, 3] },
      { size: 29, scales: [2, 3] },
      { size: 40, scales: [2, 3] },
      { size: 60, scales: [2, 3] },
      { size: 76, scales: [1, 2] },
      { size: 83.5, scales: [2] },
      { size: 1024, scales: [1] },
    ];
    console.log('\nCopying icons to iOS asset catalog...');
    const iconsDir = path.join(__dirname, 'icons');
    const availableIcons = fs.readdirSync(iconsDir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => ({ name: f, size: parseInt(f.replace(/[^0-9]/g, ''), 10) }));

    for (const { size, scales } of sizes) {
      for (const scale of scales) {
        const px = Math.round(size * scale);
        const closest = availableIcons.reduce((best, icon) =>
          Math.abs(icon.size - px) < Math.abs(best.size - px) ? icon : best
        );
        const dest = path.join(assetCatalog, `icon-${size}@${scale}x.png`);
        try {
          fs.copyFileSync(path.join(iconsDir, closest.name), dest);
        } catch {}
      }
    }
  }
}

// Step 5: Patch Info.plist for background modes and permissions
const infoPlist = path.join(iosDir, 'App', 'App', 'Info.plist');
if (fs.existsSync(infoPlist)) {
  let plist = fs.readFileSync(infoPlist, 'utf8');

  const additions = {
    NSMotionUsageDescription: 'Unconditional uses motion data to detect when you might be falling asleep, so it can trigger bedtime routines.',
    NSMicrophoneUsageDescription: 'Unconditional monitors ambient audio levels to detect elevated voices and provide relationship support.',
    NSUserNotificationsUsageDescription: 'Unconditional sends medication reminders, mental health check-ins, and love reminders.',
  };

  for (const [key, value] of Object.entries(additions)) {
    if (!plist.includes(`<key>${key}</key>`)) {
      plist = plist.replace(
        '</dict>\n</plist>',
        `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>`
      );
    }
  }

  // Add background modes for notifications and audio
  if (!plist.includes('UIBackgroundModes')) {
    plist = plist.replace(
      '</dict>\n</plist>',
      `\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t\t<string>fetch</string>\n\t\t<string>remote-notification</string>\n\t</array>\n</dict>\n</plist>`
    );
  }

  fs.writeFileSync(infoPlist, plist);
  console.log('\nUpdated Info.plist with permissions and background modes.');
}

console.log('\n=== Build Complete ===');
console.log('\nNext steps:');
console.log('  1. Open in Xcode:  npx cap open ios');
console.log('  2. Select your iPhone 14 Pro Max in the device dropdown');
console.log('  3. For Mac Catalyst: In Xcode → General → Deployment Info, check "Mac (Designed for iPad)"');
console.log('  4. Build and run (Cmd+R)');
console.log('\nTo install on your iPhone without Xcode:');
console.log('  1. Connect your iPhone via USB');
console.log('  2. In Xcode: Product → Destination → select your iPhone');
console.log('  3. Click the Run button (or Cmd+R)');
console.log('  4. Trust the developer certificate on your iPhone:');
console.log('     Settings → General → VPN & Device Management → trust your dev cert');
console.log('');
