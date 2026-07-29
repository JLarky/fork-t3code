import { useCallback, useState } from "react";

import { hasAutoplayPermission, playSendDing, warmSendDing } from "./sound";

/** Coordinates the one-time browser gesture needed for Say To Me sounds. */
export function useSoundUnlock() {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showEnableSound, setShowEnableSound] = useState(false);

  const reportPermissionIssue = useCallback(() => {
    setShowEnableSound(true);
  }, []);

  const enableSound = useCallback(async () => {
    try {
      const warmed = await warmSendDing();
      // A nearly inaudible playback confirms permission in browsers that do
      // not expose navigator.getAutoplayPolicy.
      const played = await playSendDing({ volumeScale: 0.01 });
      if (warmed || played || hasAutoplayPermission()) {
        setSoundEnabled(true);
        setShowEnableSound(false);
      }
    } catch {
      // Keep the prompt visible so the user can retry after browser permission
      // changes or a transient audio-device failure.
    }
  }, []);

  return { soundEnabled, showEnableSound, enableSound, reportPermissionIssue };
}
