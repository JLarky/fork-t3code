/**
 * Deterministic Say To Me voice-room id for a T3 thread.
 * The current T3 worktree instance uses the T3 session id directly.
 */
export function voiceNotesSessionId(_environmentId: string, threadId: string): string {
  return `t3_${threadId}`;
}

const LEGACY_VO_T3_PATTERN =
  /^vo_t3_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})__([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const T3_PATTERN = /^t3_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parseVoiceNotesSessionId(
  sessionId: string,
): { environmentId: string; threadId: string } | null {
  const legacyMatch = LEGACY_VO_T3_PATTERN.exec(sessionId);
  if (legacyMatch) {
    return { environmentId: legacyMatch[1]!, threadId: legacyMatch[2]! };
  }

  const match = T3_PATTERN.exec(sessionId);
  if (!match) return null;
  return { environmentId: "", threadId: match[1]! };
}
