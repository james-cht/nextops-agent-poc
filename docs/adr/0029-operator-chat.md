# ADR-0029: Operator Chat as a collaboration surface

## Status

Accepted target; **partially implemented**. Public Room, last-read / unread badge, Operator DMs + roster, Public Room `@OPSGPT` one-shot, and OPSGPT DM are in ([#13](https://github.com/james-cht/nextops/issues/13)–[#17](https://github.com/james-cht/nextops/issues/17)). v1 non-goals (presence, files, search, threads) are not started. Depends on Operator Accounts ([ADR-0027](0027-operator-accounts.md)), the Orchestrator Chat Contract ([ADR-0016](0016-langgraph-diagnosis-orchestrator.md), [ADR-0023](0023-retire-dify-orchestrator-fallback.md)), Diagnosis Traces ([ADR-0024](0024-diagnosis-trace-observability.md)), and Assistant Images ([ADR-0010](0010-assistant-images-opsgpt.md)). Does **not** reopen Site-scoped roles, WebSocket for Alert/Log feeds, Dify as orchestrator, or Robusta as a chat participant.

**Glossary:** `CONTEXT.md` — Operator Chat, Public Room, Operator DM, OPSGPT DM, OPSGPT Participant, Operator Chat Store.

## Context

Cluster Operators on one NextOps deployment need to talk to each other while looking at Global Matrix, Alert Center, Smart Logging, or Site Detail — and sometimes to ask OPSGPT without leaving that context.

AI Diagnosis on `/ai` is already a conversation, but it is the wrong product: a 1:1 Cluster Operator ↔ Diagnosis Orchestrator room in the Diagnosis Conversation Store, deleted on Site Binding change or room clear (7 days or 20 turns), with Viewer forbidden to start a turn. CONTEXT.md rejects calling that orchestrator a chatbot. Robusta History is investigation records, not an online participant. Dify Agent is retired.

Folding Slack-like rooms into `/ai` would poison both products (shared diagnosis context across people and Sites; Operator Chat retention vs diagnosis retention; Viewer seeing a “multiplayer OPSGPT”). A second LLM personality (idle chat bot) would be a second AiBridge Gateway path, a second Trace policy, and a second product surface.

This ADR records the locked collaboration product: **Operator Chat**.

## Decision

1. **New surface, not OPSGPT multiplayer.** Operator Chat is a Cluster Operator collaboration product. The `/ai` OPSGPT pane, generate-report, Bounded Log Analysis, and Robusta History Report stay as they are. Operator Chat does not merge with those UIs and does not share a Diagnosis Conversation id with the `/ai` room.

2. **Topology (v1).** Exactly three conversation kinds:
   - one fleet **Public Room** (UI name **公共**) — not Site-scoped, not operator-created channels, not `#general`;
   - **Operator DM** — 1:1 between two Operator Accounts;
   - **OPSGPT DM** — 1:1 between one Operator Account and the **OPSGPT Participant**.
   No group DMs, no per-Site rooms, no threads, no arbitrary channel catalog.

3. **Who may speak.** Platform Owner, Operator, and Viewer may read and write **human** messages in the Public Room and in Operator DMs. Only Operator and Platform Owner may invoke the OPSGPT Participant (Public Room `@OPSGPT` / chip, or send in an OPSGPT DM). Viewer may read OPSGPT replies that others posted in the Public Room, must not invoke OPSGPT, and must not send in an OPSGPT DM (same `canStartDiagnosisTurn` spirit as `/ai`).

4. **The only AI participant is OPSGPT.** Backed by the Diagnosis Orchestrator and the Orchestrator Chat Contract (`/api/ai/query`). Not a second idle-chat model, not Dify, not Robusta, not an admin Agent directory. Chat does not start generate-report or Bounded Log Analysis. No Site Binding control in Operator Chat; if the prompt names a Site, existing `list_sites` matching applies; otherwise the turn is unbound.

5. **Where a turn lives.**
   - **Public Room:** explicit `@OPSGPT` prefix (case-insensitive) or mention chip. That send is **one** Orchestrator turn. The human message and the OPSGPT reply are Public Room messages. Follow-up is OPSGPT DM or `/ai`, not a public multi-turn diagnosis room. A Viewer message that happens to contain the prefix is ordinary human text (no turn).
   - **OPSGPT DM:** every Operator / Platform Owner send is the next turn in that account’s **chat-scoped** Diagnosis Conversation (not the `/ai` id). No prefix required.
   - **Operator DM:** never a diagnosis turn. `@OPSGPT` is plain text. The OPSGPT Participant cannot be invited into an Operator DM.

6. **OPSGPT Participant identity.** Stable synthetic id `participant:opsgpt` (not an Operator Account). Display name **OPSGPT** (the in-chat brand; not the sidebar label 運維助手). Creating an Operator Account whose Username equals `OPSGPT` (case-insensitive) is rejected. `@OPSGPT` / chip bind to the synthetic id even if a legacy Username collision exists; Username remains immutable ([ADR-0027](0027-operator-accounts.md)).

7. **Operator Chat Store.** A process-local SQLite sidecar, sibling to the Local Settings Store, Diagnosis Conversation Store, and Diagnosis Trace Store. It holds Public Room and DM **messages** (author, room, time, body, optional link to an Orchestrator turn) and per–Operator Account **last-read** cursors. Human text retention is **30 days**, then dropped — not a work-order archive. Diagnosis continuity for OPSGPT DM stays in the Diagnosis Conversation Store (existing 7 days / 20 turns). Traces stay in the Diagnosis Trace Store. Restart must not wipe chat. v1: no full-text search, no edit, no delete/recall of a single message.

8. **Chrome.** Layout header control (beside the Alert bell), label **聊天**. Opens a slide-over: room list + transcript + compose. Survives route changes; does not steal the primary sidebar; is not a `/chat` page; is not a bottom-right support bubble; is not merged with the `/ai` split. Product noun in docs: **Operator Chat**. Avoid Slack, chatbot, IM, 訊息中心, 協作平台.

9. **Transport.** Send is authenticated `POST` (persist, then broadcast). Live updates are a **dedicated** layout **Chat SSE** (not mixed into Alert SSE, not WebSocket — same rationale as [ADR-0005](0005-alert-feed-sse-architecture.md) / [ADR-0004](0004-smart-logging-sse-architecture.md)). The Chat SSE stays connected while the Session is valid, including when the panel is collapsed, so the unread badge can move. History and unread summaries are **REST**: open a room with the latest 50 messages and cursor older; on load/reconnect `GET` unread summary. SSE carries only subsequent `message` / `message_updated` (and equivalent) events — no 30-day snapshot dump.

10. **AI delivery on the wall.** Persist and broadcast the human message immediately. If the send invokes OPSGPT, persist a second message from the OPSGPT Participant in **pending**, run the orchestrator in the background, then `message_updated` with the complete Diagnosis Answer (or a visible error). No token events on Chat SSE (Phase I gateway still has no native token stream). Failed turns still write a Diagnosis Trace ([ADR-0024](0024-diagnosis-trace-observability.md)). While that Operator Account has a pending Operator Chat AI message, further Operator Chat AI invokes from that account are rejected (Public Room @ and OPSGPT DM share this lock). `/ai`, Bounded Log Analysis, and Robusta generate do **not** share this lock or the chat hourly cap.

11. **Unread.** Server last-read per Operator Account per room in the Operator Chat Store. Header badge = count of **rooms** with newer messages, not raw message count. Own human sends do not unread the sender; the invoker’s own pending→completed OPSGPT message does not unread the invoker. No read receipts. No mute. Other tabs of the same Session refresh unread on reconnect or focus — v1 does not fan out last-read events.

12. **Roster.** Every authenticated role may list enabled Operator Accounts as **Username + Operator Role** only (no Operator Email, no Client IP, no Session metadata, no presence). Cannot DM yourself. Disabled accounts are omitted; existing Operator DMs remain readable until message expiry, but new sends are rejected. The OPSGPT Participant is pinned at the top; Viewer who opens OPSGPT DM cannot send.

13. **Payload.** Human messages: plain text, newlines kept, autolink `http(s):` and same-origin NextOps paths, hard cap **4000** characters (reject, do not truncate). No markdown, HTML, uploads, clipboard images, or human `@username` parsing. OPSGPT completed messages reuse the existing OPSGPT Diagnosis Answer renderer (headings, tables, Report Callouts, **no Detail Appendix**) plus at most three Assistant Images on the Image Allowlist ([ADR-0010](0010-assistant-images-opsgpt.md)). Operator Chat is not a third markdown dialect and not Pane Maximize.

14. **Rate limits (Operator Chat only).** Human: **20** messages / minute / Operator Account across all rooms (HTTP 429, no persist). OPSGPT from Operator Chat: **one** in-flight pending per Operator Account, and **10** turns / hour / account (failed turns count). Viewer is bound only by the human cap.

15. **Privacy.** Operator DMs and OPSGPT DMs are readable only by their two participants. Platform Owner gets no admin “open any DM” surface; diagnosis governance remains Diagnosis Traces. Host access to the sqlite file is break-glass, not a product. v1 has no export. The Public Room is visible to every Operator Account by design.

16. **v1 non-goals.** Presence dots, typing indicators, edit/delete/recall, search, threads, sounds / OS notifications, emoji reactions, mention-weighted unread, multi-tab live last-read sync, file attachments, a second LLM bot.

## Considered Options

| Option | Outcome |
|--------|---------|
| New Operator Chat surface (chosen) | Human coordination without rewriting diagnosis rooms |
| Make `/ai` a shared room | Per-account Diagnosis Conversation, Site-clear, Viewer gate, and Trace actor all break |
| Slack channel catalog + private channels | IM product; Operator Role is not a workspace ACL |
| Per-Site rooms | Site Binding is not authorization; cross-site handoff splits |
| Second idle-chat LLM | Second gateway path and Trace policy |
| Robusta as a Robot participant | Robusta does not listen on NextOps chat; History is the product |
| Put transcripts in Local Settings Store | Mixes secrets and Sessions with chatter |
| Put transcripts in Diagnosis Conversation Store | 7-day / 20-turn diagnosis retention, or the reverse: IM kills diagnosis hygiene |
| In-memory Map (Alert-style) | Deploy wipes the shift wall |
| WebSocket bidirectional | New protocol beside two known SSE paths; send is already POST |
| Mix chat events into Alert SSE | Couples two products’ snapshot/heartbeat contracts |
| Token-stream AI on Chat SSE | Gateway has no token stream; public wall flickers; Viewer sees fragments |
| Owner-readable DMs | Surveillance product; Traces already cover diagnosis turns |
| Operator-uploaded files / gateway `file` | New blob store, or Phase I gateway file upload |

## Consequences

- Implement Operator Chat Store, Chat SSE, header slide-over, roster (Username + role), Public Room bootstrap, last-read, and Orchestrator Chat Contract calls from Public Room @ and OPSGPT DM — without sharing `/ai` conversation ids.
- Keep Tool Endpoint JSON off the browser and off Operator Chat messages; the wall shows Diagnosis Answer (+ Assistant Images) only.
- Username issuance must reject `OPSGPT`; `@OPSGPT` must resolve to `participant:opsgpt`.
- Layout holds two EventSources (Alert + Chat) while logged in; Chat SSE is Session activity ([ADR-0027](0027-operator-accounts.md)).
- Do not add Redis/WebSocket for v1; single SvelteKit process remains ([ADR-0001](0001-single-sveltekit-service.md), [ADR-0005](0005-alert-feed-sse-architecture.md)).
- Documentation and UI must not call this Slack, a chatbot, or 運維助手.
- Phase II (presence, files, search, threads, Owner e-discovery) needs a new ADR; this one does not pre-approve them.
