#!/usr/bin/env bash
set -euo pipefail
package=vn.driveledger.mobile
adb install -r DriveLedger-NPT-duy-Android.apk
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$package/.MainActivity"
for attempt in $(seq 1 50); do
  if adb shell uiautomator dump /sdcard/driveledger-ui.xml >/dev/null 2>&1 &&
    adb exec-out cat /sdcard/driveledger-ui.xml | grep -F 'Đăng nhập' >/dev/null; then
    adb shell pidof "$package" >/dev/null
    exit 0
  fi
  sleep 2
done
echo "The standalone app did not reach its sign-in screen" >&2
adb logcat -b crash -d -t 60
exit 1
