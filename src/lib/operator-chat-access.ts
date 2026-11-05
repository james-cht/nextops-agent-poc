import { parsePublicOpsgptInvoke } from './operator-chat-body.ts';
import { canStartDiagnosisTurn, type OperatorRole } from './operator-role.ts';
import {
  OPSGPT_DISPLAY_NAME,
  OPSGPT_PARTICIPANT_ID,
  type ChatRosterEntry,
} from './operator-chat-types.ts';
import type { ChatRoomKind } from './operator-chat-types.ts';
import { operatorVisibleName } from './operator-display-name.ts';

export function chatCanReadRoom(opts: {
  kind: ChatRoomKind;
  username: string;
  memberIds: string[];
}): boolean {
  const who = opts.username.trim();
  if (!who) return false;
  if (opts.kind === 'public') return true;
  return opts.memberIds.includes(who);
}

export function chatWriteBlock(opts: {
  kind: ChatRoomKind;
  username: string;
  memberIds: string[];
  role: OperatorRole | null | undefined;
  counterpartDisabled: boolean;
}): 'FORBIDDEN' | 'DISABLED' | 'VIEWER' | null {
  if (!chatCanReadRoom(opts)) return 'FORBIDDEN';
  if (opts.kind === 'operator_dm' && opts.counterpartDisabled) return 'DISABLED';
  if (opts.kind === 'opsgpt_dm' && !canStartDiagnosisTurn(opts.role)) return 'VIEWER';
  return null;
}

export function chatShouldInvokeOpsgpt(opts: {
  kind: ChatRoomKind;
  role: OperatorRole | null | undefined;
  body: string;
  mentionChip?: boolean;
}): boolean {
  if (!canStartDiagnosisTurn(opts.role)) return false;
  if (opts.kind === 'opsgpt_dm') return true;
  if (opts.kind === 'public') {
    return parsePublicOpsgptInvoke(opts.body, opts.mentionChip === true).invoke;
  }
  return false;
}

export function buildChatRoster(opts: {
  viewerUsername: string;
  accounts: Array<{
    username: string;
    displayName?: string | null;
    role: OperatorRole;
    disabled: boolean;
  }>;
}): ChatRosterEntry[] {
  const self = opts.viewerUsername.trim();
  const opsgpt: ChatRosterEntry = {
    id: OPSGPT_PARTICIPANT_ID,
    displayName: OPSGPT_DISPLAY_NAME,
    kind: 'opsgpt',
  };
  const operators = opts.accounts
    .filter((a) => !a.disabled && a.username !== self)
    .map(
      (a): ChatRosterEntry => ({
        id: a.username,
        displayName: operatorVisibleName({ displayName: a.displayName, username: a.username }),
        kind: 'operator',
        role: a.role,
      }),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return [opsgpt, ...operators];
}
