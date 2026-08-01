import { Volume2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import { setVoiceWidgetPlaybackActive } from "./audioQueue";
import { SAY_TO_ME_UI_URL } from "./sayToMeUi";
import { hasAutoplayPermission } from "./sound";
import { useSoundUnlock } from "./useSoundUnlock";
import { voiceNotesSessionId } from "./voiceSessionId";
import {
  loadSayToMeVoiceWidgetHmrModuleOnce,
  readSayToMeVoiceWidgetCollapsedPreference,
  resolveSayToMeVoiceWidgetLoader,
  SAY_TO_ME_VOICE_WIDGET_COLLAPSE_EVENT,
  SAY_TO_ME_VOICE_WIDGET_COLLAPSE_STORAGE_KEY,
  SAY_TO_ME_VOICE_WIDGET_ERROR_EVENT,
  SAY_TO_ME_VOICE_WIDGET_INSERT_USAGE_PROMPT_EVENT,
  SAY_TO_ME_VOICE_WIDGET_LAYOUT_FLOATING,
  SAY_TO_ME_VOICE_WIDGET_NOTES_BASE_URL,
  SAY_TO_ME_VOICE_WIDGET_PERMISSION_ISSUE_EVENT,
  SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT,
  SAY_TO_ME_VOICE_WIDGET_SRC,
  sayToMeVoiceWidgetCanAutoplayAttr,
  sayToMeVoiceWidgetContextAttrs,
  sayToMeVoiceWidgetHostPanelClass,
  sayToMeVoiceWidgetHostSectionClass,
  type SayToMeVoiceWidgetLoader,
} from "./voiceWidget";
import { parseSayToMeVoiceWidgetHostEvent } from "./voiceWidgetHostAdapter";

type HostedSayToMeVoiceWidgetProps = {
  readonly environmentId: string;
  readonly threadId: string;
  /** Canonical thread title → `session-title` (S-theme display-only). */
  readonly sessionTitle?: string | null;
  /** Canonical project display name → `project-name`. */
  readonly projectName?: string | null;
  /** Active workspace / worktree cwd → `working-directory`. */
  readonly workingDirectory?: string | null;
  /** Thread branch → `branch-name`. */
  readonly branchName?: string | null;
  /** Composer insertion using the exact event `prompt` (Host Contract v1). */
  readonly onInsertUsagePrompt?: (prompt: string) => void;
  /** Optional override for tests; defaults to hostname/dev selection. */
  readonly loader?: SayToMeVoiceWidgetLoader;
};

/**
 * Thin T3 host for STM's liftSolid `<say-to-me-voice-widget>`.
 * Supplies Contract v1 + S-theme attributes and applies host-side event actions.
 */
export function HostedSayToMeVoiceWidget({
  environmentId,
  threadId,
  sessionTitle = null,
  projectName = null,
  workingDirectory = null,
  branchName = null,
  onInsertUsagePrompt,
  loader = resolveSayToMeVoiceWidgetLoader(),
}: HostedSayToMeVoiceWidgetProps) {
  const sessionId = voiceNotesSessionId(environmentId, threadId);
  const { soundEnabled, showEnableSound, enableSound, reportPermissionIssue } = useSoundUnlock();
  const canAutoplay = soundEnabled || hasAutoplayPermission();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [activeLoader, setActiveLoader] = useState<SayToMeVoiceWidgetLoader>(loader);
  const [collapsed, setCollapsed] = useState(() => readSayToMeVoiceWidgetCollapsedPreference());
  const [collapsedAck, setCollapsedAck] = useState<boolean | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const contextAttrs = sayToMeVoiceWidgetContextAttrs({
    sessionTitle,
    projectName,
    workingDirectory,
    branchName,
  });

  useEffect(() => {
    setActiveLoader(loader);
  }, [loader]);

  useEffect(() => {
    if (loader.mode !== "hmr") return;
    loadSayToMeVoiceWidgetHmrModuleOnce(loader.moduleUrl, {
      onResult: (result) => {
        if (result === "classic-fallback") {
          setActiveLoader({ mode: "classic", scriptSrc: SAY_TO_ME_VOICE_WIDGET_SRC });
        }
      },
    });
  }, [loader]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const onWidgetEvent = (event: Event) => {
      const action = parseSayToMeVoiceWidgetHostEvent(event);
      if (!action) return;

      switch (action.type) {
        case "collapse-change":
          console.info("[say-to-me-voice-widget] collapse-change", action);
          setCollapsed(action.collapsed);
          setCollapsedAck(action.collapsed);
          break;
        case "error":
          console.error("[say-to-me-voice-widget] error", action);
          setLastError(action.message);
          break;
        case "insert-usage-prompt":
          onInsertUsagePrompt?.(action.prompt);
          break;
        case "open-session":
        case "park-session":
          break;
        case "permission-issue":
          reportPermissionIssue();
          break;
        case "playback-change":
          setVoiceWidgetPlaybackActive(action.playingId !== null);
          break;
      }
    };

    const eventNames = [
      SAY_TO_ME_VOICE_WIDGET_COLLAPSE_EVENT,
      SAY_TO_ME_VOICE_WIDGET_ERROR_EVENT,
      SAY_TO_ME_VOICE_WIDGET_INSERT_USAGE_PROMPT_EVENT,
      SAY_TO_ME_VOICE_WIDGET_PERMISSION_ISSUE_EVENT,
      SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT,
    ] as const;

    for (const name of eventNames) {
      node.addEventListener(name, onWidgetEvent);
    }
    return () => {
      for (const name of eventNames) {
        node.removeEventListener(name, onWidgetEvent);
      }
      setVoiceWidgetPlaybackActive(false);
    };
  }, [onInsertUsagePrompt, reportPermissionIssue]);

  return (
    <div
      ref={hostRef}
      data-testid="say-to-me-voice-widget-host"
      data-voice-widget-loader-mode={activeLoader.mode}
      data-voice-widget-preferred-loader={loader.mode}
      data-collapsed={collapsed ? "true" : "false"}
      className={sayToMeVoiceWidgetHostSectionClass(collapsed)}
    >
      <div className={sayToMeVoiceWidgetHostPanelClass(collapsed)}>
        {activeLoader.mode === "hmr" ? (
          <span
            hidden
            data-testid="say-to-me-voice-widget-hmr-loader"
            data-module-url={activeLoader.moduleUrl}
          />
        ) : (
          <script src={activeLoader.scriptSrc} async data-testid="say-to-me-voice-widget-script" />
        )}
        {/* Empty host element + Contract v1 / S-theme attributes — STM owns markup. */}
        <say-to-me-voice-widget
          data-testid="say-to-me-voice-widget-element"
          session-id={sessionId}
          notes-base-url={SAY_TO_ME_VOICE_WIDGET_NOTES_BASE_URL}
          can-autoplay={sayToMeVoiceWidgetCanAutoplayAttr(canAutoplay)}
          storage-key={SAY_TO_ME_VOICE_WIDGET_COLLAPSE_STORAGE_KEY}
          ui-base-url={SAY_TO_ME_UI_URL}
          layout={SAY_TO_ME_VOICE_WIDGET_LAYOUT_FLOATING}
          {...contextAttrs}
        />
        {showEnableSound ? (
          <div
            data-testid="say-to-me-voice-widget-enable-sound"
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-xs"
          >
            <span className="text-muted-foreground">
              Enable sound to hear Say To Me notifications.
            </span>
            <Button type="button" size="xs" variant="outline" onClick={() => void enableSound()}>
              <Volume2Icon className="size-3.5" aria-hidden />
              Enable sound
            </Button>
          </div>
        ) : null}
        {collapsedAck !== null ? (
          <p
            data-testid="say-to-me-voice-widget-collapse-ack"
            data-collapsed={collapsedAck ? "true" : "false"}
            className="text-muted-foreground text-xs"
          >
            Collapse {collapsedAck ? "on" : "off"}
          </p>
        ) : null}
        {lastError ? (
          <p data-testid="say-to-me-voice-widget-error-ack" className="text-destructive text-xs">
            Widget error: {lastError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
