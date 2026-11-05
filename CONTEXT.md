# NextOps

AI-based computing cluster operation dashboard. Centralized global platform that ingests logs and metrics from regional clusters into ElasticSearch and Prometheus, and provides AI-assisted diagnosis and natural-language querying via a Diagnosis Orchestrator.

## Language

**Site (Regional Cluster)**:
A distinct computing cluster deployed in a physical location (e.g. 龍華, 重慶, 煙台). Each Site has a Prometheus `cluster_tag`, a Factory Code for log index routing, a Default Log Mode, Robusta Coverage, and a Robusta Cluster Key; it pushes metrics and logs to the central Prometheus and Elasticsearch. Exec-facing Traditional Chinese may say 廠區 for the campus that hosts a Site; the product noun remains Site — one catalog Site is one computing cluster, not a Kubernetes control plane.
_Avoid_: Region, datacenter, location, 機房 (as the Site noun), treating 廠區 as a K8s console

**Factory Code**:
The short site code used in Elasticsearch log index names (e.g. `lh`, `cq`, `yt`, `amata`, `cttv`, `na`). Identical to the non-K8s log `env` segment. Distinct from Prometheus `cluster_tag` (e.g. `lh-k8s-cluster`). A Site without a Factory Code cannot serve Smart Logging or log Tool Endpoints.
_Avoid_: cluster_tag, siteId, region code, LOG_INDEX

**Default Log Mode**:
Per-Site catalog flag (`k8s` | `non_k8s`) for whether a Site's logs are primarily Kubernetes-shaped. Missing value means `k8s`. It is not a Smart Logging page control after Index Watchlist; that page has no Mode toggle.
_Avoid_: host type, environment type, cluster kind, treating this as a live Mode toggle on Smart Logging

**Robusta Coverage**:
Per-Site catalog flag for whether Robusta is deployed at that Site. False or missing means the Site has no Robusta Investigations: Robusta History shows the not-deployed empty state and does not query the Robusta Store. Distinct from zero Investigations in the Robusta History Window on a covered Site. Coverage without a Robusta Cluster Key still cannot list Investigations. Lives on the Site catalog (deploy configuration), like Factory Code — not a Runtime Setting and not the Local Settings Store.
_Avoid_: hard-coding the Longhua Site, treating an empty window as not-deployed, inferring coverage from Prometheus `cluster_tag` or Factory Code, using Coverage itself as the Store row filter, toggling Coverage in SRE admin as a Runtime Setting

**Robusta Cluster Key**:
The Robusta-side cluster identity stored on the Site catalog and used to filter Robusta Store rows to that Site. Distinct from Prometheus `cluster_tag` and from Factory Code. A Site without a Robusta Cluster Key cannot list Investigations, even if Robusta Coverage is true. Lives on the Site catalog (deploy configuration), like Factory Code — not a Runtime Setting and not the Local Settings Store.
_Avoid_: cluster_tag as the Robusta filter, Factory Code as the Robusta filter, treating Coverage alone as a row filter, siteId as the Store cluster name unless it actually matches, editing this key as a Runtime Setting

**Tool Endpoint**:
An HTTP endpoint exposed by the SvelteKit backend that the Diagnosis Orchestrator calls as a tool during AI diagnosis. Examples: `get_site_overview`, `get_site_resource_health`, `query_elasticsearch`, `list_sites`, `describe_site`.
_Avoid_: API, plugin, function call

**Tool Endpoint MCP Adapter**:
An MCP server that exposes a fixed, allowlisted set of tools whose implementations only call NextOps Tool Endpoints (Bearer auth). It does not open a second path to Prometheus or Elasticsearch. Originally introduced so a Dify Agent could register tools via MCP. With a LangGraph Diagnosis Orchestrator that calls Tool Endpoints over HTTP directly, the Adapter is **not** on the primary path and may be retired.
_Avoid_: MCP as arbitrary HTTP proxy, MCP that runs PromQL/ES DSL directly, replacing the Diagnosis Orchestrator with MCP, requiring MCP for LangGraph tool calling

**Tool Endpoint Base URL**:
The NextOps in-cluster address used when calling Tool Endpoints. For the Tool Endpoint MCP Adapter, this is typically in-pod loopback to NextOps. The Diagnosis Orchestrator may call Tool Endpoints directly or via the Adapter. On a deploy whose Public Base Path is not empty, those Tool Endpoint paths sit under that prefix — it is not a second, prefix-free NextOps on the same process.
_Avoid_: localhost inside an unrelated container, hard-coding only one host forever, treating loopback as a second NextOps that ignores Public Base Path

**Diagnosis Orchestrator**:
The AI orchestration layer for AI Diagnosis. Receives operator questions (and optional Site Binding) from NextOps, invokes allowlisted tools that reach data only through Tool Endpoints, calls an LLM provider, and returns a Diagnosis Answer (plus optional Assistant Images). It does not own Prometheus or Elasticsearch clients. The implementation is the LangGraph Diagnosis Orchestrator. Dify is not a fallback path.
_Avoid_: AI bot, chatbot, LLM wrapper, embedding Prom/ES clients in the orchestrator, treating MCP alone as the orchestrator, Dify as an emergency orchestrator

**Diagnosis Graph**:
The bounded Phase I workflow of the Diagnosis Orchestrator: resolve Site Binding, call the allowlisted Tool Endpoints, then send tool JSON to the AiBridge Gateway to produce a Diagnosis Answer. The gateway does not select or execute tools.
_Avoid_: free-form text ReAct as the Phase I path, native gateway tool_calls, asking the operator to paste metrics

**AI Diagnosis** (運維助手 / OPSGPT):
LLM-powered root-cause analysis on `/ai` (sidebar: 運維助手; in-chat brand: OPSGPT 助手). The left pane is the Site Health Brief, including any generated report. The right pane is OPSGPT: free-form Q&A with the same heading, table, and Report Callout chrome as a Visual Summary, but no Detail Appendix. Bound-site suggestion chips are 資源熱點 and 重啟風險 only. A Diagnosis Answer is produced only when the Cluster Operator sends a chat query or explicitly generates a report while a Site is bound — not on page load or Site Binding alone. The Diagnosis Orchestrator gathers data only through NextOps Tool Endpoints. Tool Endpoint JSON stays inside the orchestrator turn; NextOps consumes the Diagnosis Answer plus optional Assistant Images — not a separate structured tool payload. Generate-report is one turn in the same Diagnosis Conversation as OPSGPT Q&A; NextOps does not paint that turn’s prompt or answer in the OPSGPT pane. The room continues until Site context is cleared or changed or the page reloads. Operator Chat is a different surface: Public Room `@OPSGPT` and OPSGPT DM also use the Orchestrator Chat Contract but do not share this room’s conversation id.
_Avoid_: AI analysis, auto-diagnosis on bind, smart report as a second LLM surface, painting the generated report in OPSGPT, a 運行狀態 suggestion chip that restates Live Brief or generate-report, ops-agent (as a separate product surface), expecting resource-health JSON on `/api/ai/query`, free-form PromQL or Lucene from the orchestrator as a Phase I capability, treating Operator Chat as this page, painting Operator Chat in the OPSGPT pane

**Diagnosis Answer**:
The final natural-language reply the Diagnosis Orchestrator returns to NextOps after optional Tool Endpoint calls. One generate turn yields one answer. A generated report is presented only in the Site Health Brief as a Visual Summary followed by an optional Detail Appendix — not two orchestrator products, not a machine-parsed diagnosis schema, and not replayed as an OPSGPT transcript.
_Avoid_: tool raw JSON as the chat response body, a second LLM report that is not a chat turn, two report types as two LLM turns, dual-fetch of Prometheus from NextOps after the orchestrator already called tools, reviving ```rca as the left-pane filler, showing the generated report in the OPSGPT pane

**Visual Summary** (視覺摘要):
The first presentation layer of a *generated* Diagnosis Answer in the Site Health Brief: Report Callouts, real tables, and lively section chrome for findings and tips. Visible headings are UI, not raw `**markdown**` left on the page. It is the text before the Appendix Marker; if the marker is absent, the whole generated answer is this layer.
_Avoid_: pre-wrap dump of `**title**`, treating this layer as a separate Tool Endpoint payload, using OPSGPT as the Visual Summary surface, inventing a findings JSON schema to drive this layer, ASCII tables, model emoji as heading chrome

**Report Callout** (報告提示塊):
A short highlighted 重點, 提示, 風險, or 建議 in Diagnosis Answer chrome (Visual Summary, and the same renderer on OPSGPT Q&A). NextOps maps that fixed kind to a small status icon. Distinct from an Assistant Image.
_Avoid_: model emoji as the chrome, free-form icon names from the LLM, treating callouts as Assistant Images, hanging Detail Appendix on a callout

**Appendix Marker** (附錄標記):
The fixed heading 「詳細資料」 in a generated Diagnosis Answer that separates Visual Summary from Detail Appendix. NextOps splits on this marker only. It is a presentation delimiter, not a diagnosis schema.
_Avoid_: ```rca fences, heuristic “first N paragraphs”, a second generate turn, requiring the marker for the report to show at all

**Detail Appendix** (詳細資料):
The second presentation layer of a *generated* Diagnosis Answer in the Site Health Brief, after the Appendix Marker. Optional extra material the operator can show; still lively and readable, not a raw dump. If the marker is missing, this layer is absent.
_Avoid_: a second generate turn, a separate diagnose API, unstyled pre-wrap as the details view, hanging a details toggle on every OPSGPT chat bubble

**Site Health Brief**:
The left pane of AI Diagnosis: compact Site health charts and templated summaries. With no Site Binding it shows all Sites using overview-level saturation (same class of figures as Global Matrix Site cards) plus firing-alert counts — a navigation summary, not a second dashboard, and not Site Resource Health. With Site Binding it has two sibling regions that must not overlay: a Live Brief and a Generated Report region. Charts and alert lists may refresh while a generated Diagnosis Answer stays until the next generate, Site change, or room clear (a stale-report notice if live data moved on). The operator generates that answer only via an explicit generate-report action (expanding a section never starts a turn; not one LLM turn per alert). That turn shares the OPSGPT Diagnosis Conversation but is not shown on the right.
_Avoid_: RCA page, strategic RCA card, auto-filled ```rca JSON, treating the brief as a Diagnosis Answer, duplicating the Global Matrix Dashboard, per-alert auto-diagnosis, calling Site Resource Health for every Site while unbound, duplicating the generated report into OPSGPT, stacking live and report blocks as competing details that overlap

**Live Brief** (即時簡報):
The bound Site Health Brief strip of Site Resource Health saturation, hotspots, and that Site’s firing alerts. Each block collapses on its own and occupies only its content height. When a generated Diagnosis Answer is present, this strip is height-capped and scrolls inside itself so the Generated Report region always keeps a usable remainder. Generate-report does not change which Live Brief blocks are open. Without a generated answer, the strip may use more of the pane. It is live telemetry, not a Diagnosis Answer.
_Avoid_: treating Live Brief charts as the Visual Summary, one-open-only accordion that hides saturation while a report is open, auto-collapsing the Live Brief on generate, forcing Live Brief blocks closed when a report arrives, letting an expanded Live Brief steal all height from a generated report

**Generated Report region**:
The remaining height of the bound Site Health Brief for a generated Diagnosis Answer. Visual Summary scrolls inside this region; Detail Appendix sits at the end of it and starts collapsed. Absent until the operator generates. While present, it keeps a usable remainder even if the Live Brief is fully expanded.
_Avoid_: painting this region in OPSGPT, using overlapping details as the report chrome, allowing the report region to collapse to zero under a tall Live Brief

**Site Binding**:
The optional Site the operator selects in 運維助手, passed to the Diagnosis Orchestrator as `inputs.site_id` (or equivalent). When present, the orchestrator prefers this siteId for Tool Endpoint calls. When absent, or when the query names a different Site, the orchestrator calls `list_sites` and matches the operator’s wording (e.g. 「龍華」) to a catalog siteId before calling metrics or log tools. Path parameters use the catalog siteId with URL encoding (percent-encoding), never Prometheus `cluster_tag` as the path segment.
_Avoid_: cluster_tag as siteId, hard requirement to bind Site in UI before any diagnosis, unencoded CJK in tool URLs

**Assistant Image**:
A remote HTTPS image URL returned by the Diagnosis Orchestrator as part of an AI Diagnosis reply, shown in the OPSGPT chat after the text body once the stream ends. Only allowlisted hosts are loaded. At most three Assistant Images are shown per reply. NextOps validates images at stream end and attaches them via a final custom SSE event while answer text events pass through unchanged.
_Avoid_: multimedia, attachment, uploaded file, base64 image, chat file (operator-uploaded)

**Image Allowlist**:
The set of approved hostnames whose Assistant Images may be fetched and rendered in the OPSGPT chat. Non-allowlisted hosts are refused at the NextOps boundary. Built from deployment allowlist configuration plus hostnames derived from the effective orchestrator / media base configuration. Not configured via browser-local admin settings in this phase.
_Avoid_: open proxy, any HTTPS, CDN free-for-all, admin localStorage allowlist, allowlist frozen to bootstrap env only

**Blocked Image Notice**:
A non-loading chat notice that an Assistant Image was refused because its host is outside the Image Allowlist, or that an allowlisted image failed to load in the browser. Shows the hostname only, not the full URL, so operators keep diagnostic context without loading untrusted or broken content.
_Avoid_: broken image icon only, silent drop, full URL dump

**Site Resource Health**:
A Site-scoped Tool Endpoint (`get_site_resource_health`) that returns Prometheus-backed saturation, top offenders (nodes/VMs and pods/containers), restart counts, and short window deltas across host types (`k8s`, `baremetal`, `vm`, docker where series exist). Sibling to `get_site_overview`. Bound Site Health Brief uses it for depth; the unbound fleet strip uses overview-level saturation instead.
_Avoid_: risk engine, Grafana dashboard, auto-scoring, RCA schema

**Smart Logging** (智能日誌流):
A dashboard page that streams one Site's cluster logs from Elasticsearch in near-real-time. The Site is required. Until an Index Watchlist has at least one Log Index Pattern and an active pattern is chosen, the stream does not connect — the operator must pick from the Site Index Catalog first. Once set, the stream queries exactly one Log Index Pattern chosen from that Watchlist — not the union of the set. The SSE contract matches the page: time, keyword, Document Filters, and optional Log Category drill-down — not dedicated `namespace` / `pod` / `level` query params and not a Mode toggle. Those values are read from the raw log JSON when the operator drills in; clicking a JSON value adds or removes a Document Filter on that field path. Severity-style buckets are Log Categories, not a fixed level multi-select. `query_elasticsearch` may still accept dedicated namespace/pod for a compatibility period.
_Avoid_: Log viewer, log stream, log explorer, multi-site log fan-out, filebeat-* as the product index contract, putting Kubernetes namespace or pod into the Log Index Pattern, treating the Watchlist as a single combined query target, a Mode toggle or Namespace/Pod combobox as first-class Smart Logging chrome, streaming on the site-wide default wildcard while the Watchlist is empty, level checkboxes as Smart Logging chrome, keeping dedicated namespace/pod/level SSE params after the page dropped them

**Log Index Pattern**:
The Elasticsearch index naming contract for cluster logs: query default is `logs-{factoryCode}-*` (prefix configurable). Documented K8s/non-K8s segment shapes may include namespace/pod or year-week suffixes; observed production indices often use daily names such as `logs-{factoryCode}-k8s-es-log-{yyyy.MM.dd}`. An Index Watchlist stores date-collapsed families of this contract (e.g. `logs-{factoryCode}-k8s-es-log-*`), not those concrete daily names. Log Namespace and Log Pod do not rewrite this pattern. Smart Logging and AI log tools share this contract via `describe_site`. Smart Logging does not auto-stream the site-wide default while the operator's Watchlist is empty.
_Avoid_: filebeat-*, k8s-events-*, syslog-*, app-log-*, docker-logs-*, single global LOG_INDEX blob, deriving the index string from namespace or pod selection, treating a dated concrete index name as the durable Watchlist unit

**Index Watchlist** (常用 Index 清單):
A Cluster Operator's saved set of Log Index Patterns for one Site, each an index family with date suffixes collapsed. Empty until the operator chooses from that Site's Site Index Catalog; an empty Watchlist blocks Smart Logging SSE until at least one family is saved and one is active. It is a pool, not a query: each Smart Logging stream uses exactly one pattern from the set as the active Log Index Pattern. Persisted in the Local Settings Store keyed by Operator Account and Site — not browser-only. The last active Log Index Pattern per Site is stored with the Watchlist; Document Filters, keyword, and time range are not durable server preferences. Saving from the Catalog requires at least one selected family — clear selection in the editor does not persist an empty Watchlist.
_Avoid_: data view (as the product name), storing dated concrete index names, cluster-wide favorites, a second global LOG_INDEX, querying the whole Watchlist as a union, treating the Watchlist as a rewrite of Factory Code routing, localStorage as the durable home for Watchlist, restoring last Document Filters or time window as server truth, skipping the catalog gate via an implicit site-wide wildcard stream, persisting an empty Watchlist from a cleared catalog draft

**Site Index Catalog** (站點 Index 目錄):
The Elasticsearch-backed list of index families under one Site's Factory Code prefix (`logs-{factoryCode}-*`). The server enumerates concrete indices, collapses date suffixes into families, then applies the operator's fuzzy or regex filter on those family names. Selecting from the catalog populates the Index Watchlist; it is not itself the query target. When editing the Watchlist, the catalog list shows currently selected families first (in Watchlist save order), then unselected families in the search/filter result order. Catalog chrome includes a master checkbox over the visible list and an explicit clear-selection control.
_Avoid_: listing dated concrete names as the durable selection unit, cluster-wide index management, hand-typed patterns as the only setup path, filtering only after the operator has already saved dated names, burying selected families among unselected hits without promotion, master-checkbox-only without a clear affordance

**Document Filter**:
A term constraint on one field path of a log document, added or removed in Smart Logging by clicking that path's value in the raw log JSON (Kibana-style Filter for value). Distinct from keyword (a `query_string` across message-like fields) and from the Index Watchlist (which chooses the query target, not a document clause).
_Avoid_: Namespace/Pod combobox, rewriting the Log Index Pattern, treating keyword as a field-path term, a per-path dedicated control on the primary bar

**Log Summary** (日誌摘要):
The collapsed first presentation layer of a Smart Logging row. One fixed column set for the whole page: timestamp, Service Name, HTTP status, user agent, HTTP method, Network Protocol, path, and a truncated message. Missing paths render empty; they are not filled from unrelated fields except the Service Name fallback. HTTP and network columns are read only from structured document paths, never grok/regex of message. Expanding the row opens the Log Field Table, then the JSON Tree — not a global Table/Raw/JSON page mode.
_Avoid_: the current 来源/区域 mislabels, per-pattern column layouts in this phase, Kibana field picker as the v1 summary, omitting message from the collapsed row, three separate identity columns for pod/container/process, inventing summary values that are not on the document, JSON.stringify in a pre as the expand target

**Service Name** (服務名稱):
The single projected identity cell on a Log Summary. First non-empty of `kubernetes.pod_name`, then `container.name`, then `process.name`. K8s logs therefore show the pod, not the container; sidecar differences are in the raw JSON (or a Document Filter on `kubernetes.container_name`). Empty if none match. Distinct from Log Pod (a document field that may become a Document Filter, not a dedicated control).
_Avoid_: using `service` as the first fallback, host.name as a service, showing pod and container as two summary columns, treating this as a rewrite of Log Pod, using this projection as Live Pod Diagnostics identity or occupancy

**Log Summary Projection**:
The path order used to fill Log Summary columns from a log document. HTTP status: `http.response.status_code`, then `http.status_code`, then `status`. User agent: `user_agent.original`, then `user_agent`. HTTP method: `http.request.method`, then `method`. Network Protocol: `network.protocol`, then `network.transport` (http/tcp/udp — not HTTP version). Path: `url.path`, then `http.request.path`, then `path`. First non-empty wins; otherwise the cell is empty.
_Avoid_: grok/regex from message, `http.version` as protocol, treating these paths as a per-Site mapping catalog

**Log Field Table** (欄位表):
The second presentation layer of a Smart Logging row: every field path on the log document as flattened key-value rows. Clicking a value adds or removes a Document Filter. Distinct from Log Summary and from the JSON Tree.
_Avoid_: dumping JSON.stringify in a pre as this layer, per-column expand on the summary row, treating this as a global page view mode

**JSON Tree**:
The third presentation layer of a Smart Logging row: the log `_source` as a structurally collapsible JSON tree (objects and arrays fold). Clicking a scalar value adds or removes a Document Filter on that path. Distinct from a pretty-printed string dump.
_Avoid_: pre-wrap JSON.stringify as the JSON layer, a global page JSON view as the primary way to read rows

**Log Content Copy** (日誌內容複製):
An operator action on Smart Logging that copies the current reading surface to the clipboard, shown with a common copy icon (default beside the message field on the right). Surfaces: the whole Log Field Table, the whole JSON Tree, the message field row inside an expanded Log Field Table, and Message Enlarge (full message text). Distinct from Document Filter (click a value to constrain the query) and from Bounded Log Analysis selection.
_Avoid_: per-field copy icons on every path as the v1 default, treating copy as a Document Filter, auto-copy on expand

**Message Enlarge** (訊息放大):
A read-only Smart Logging overlay opened by clicking the message cell on a Log Summary row. It shows the full message string and a Log Content Copy control. Distinct from expanding the row into the Log Field Table / JSON Tree, and from Analysis Window maximize.
_Avoid_: treating Message Enlarge as the only way to copy, replacing row expand with enlarge, conflating with Pane Maximize or Analysis Window

**Log Category** (日誌分類):
A named bucket of log documents defined by an operator-owned Category Rule. Smart Logging shows each category with its Elasticsearch hit count for the current query scope (Site, active Log Index Pattern, time, keyword, Document Filters, and any active category drill-down). Editing a rule recalculates that count immediately. One document may match many categories; counts are independent, not mutually exclusive. Clicking a category applies its Category Rule as stream filters (toggle off to clear); other category totals recalculate in that narrowed scope. Correlation is the operator reading those counts side by side — not unsupervised grouping of similar lines. Persisted with its Category Rules in the Local Settings Store keyed by Operator Account and Site. When that key has no categories yet, NextOps seeds four editable, deletable templates — 錯誤詞, 5xx, Timeout, 連線失敗 — not fleet-wide forced rules. A zero count on a non-matching family (e.g. 5xx on non-HTTP logs) is allowed. Distinct from `level` (a document field or inferred severity), from keyword, and from the Index Watchlist.
_Avoid_: 分群 / Log Cluster as this product, counting only the browser-loaded buffer as the category total, treating level checkboxes as the category product, a global unscoped count across all Sites, Drain-style template mining as Log Category, first-match-wins exclusive assignment, OR-merging multiple categories into one stream filter, localStorage as the durable home for categories, undeletable system categories, treating seed templates as Runtime Settings, hiding 5xx only when the active pattern looks non-HTTP


**Category Rule** (分類規則):
The match condition of a Log Category: one or more Document Filter clauses plus an optional message keyword or regex, all AND-ed. It is not a pasted Elasticsearch DSL body.
_Avoid_: raw ES DSL, Lucene as a third query language, message-regex-only rules, a single Document Filter as the only allowed rule shape

**Log Highlight** (日誌高亮):
Client-side, deterministic emphasis on Log Summary / message text: the active keyword, Category Rule match spans, and a fixed attention lexicon (e.g. error, exception, OOM, timeout). Computed only on the loaded buffer. Smart Logging never calls an LLM to paint highlights.
_Avoid_: per-poll or per-document LLM highlighting, treating Log Highlight as AI Diagnosis, inferring severity via the model on the hot path

**Bounded Log Analysis** (框選日誌分析):
An explicit, operator-triggered Smart Logging step: the Cluster Operator selects log documents only from the currently loaded stream buffer (not an unbounded ES hit set), at most 20 rows; over the cap blocks submit until the selection is reduced. Selection chrome includes clear-all and select-all: select-all takes the first 20 rows of the current buffer order (with a notice when the buffer is larger), never more than 20. Starting analysis runs one Diagnosis Orchestrator turn (Orchestrator Chat Contract / `/api/ai/query`) with Site Binding equal to the Smart Logging Site and a compact projection of those logs as turn context — allowlisted field paths (e.g. `@timestamp`, kubernetes.*, message/log, http.*, error-related fields) plus a per-document message size cap — not the full `_source` and not Summary columns alone. The turn yields a Diagnosis Answer (optional Assistant Images). It is shown in a single Analysis Window on Smart Logging (a new run replaces the previous window after confirm); stored in the Diagnosis Conversation Store (same room rules as OPSGPT for that Site Binding — a hidden turn like generate-report, not painted as an OPSGPT chat bubble by default). Follow-up suggestion chips continue that conversation id. Viewers must not start an analysis turn. It does not call the AiBridge Gateway from the Smart Logging page, and it is not continuous stream processing. Distinct from Log Highlight and from Live Pod Diagnostics.
_Avoid_: auto-LLM on every poll, unbounded “analyze everything in the time window”, selecting beyond the loaded buffer, silent truncation past the 20-row cap without notice, select-all beyond 20, shipping raw full `_source` blobs, Summary-only payloads as the analysis body, stacking multiple Analysis Windows, appending a new selection into the previous analysis conversation by default, conflating this with Log Highlight, a second in-page AiBridge chat that bypasses the Diagnosis Orchestrator, treating Gemini as a browser-direct API, jumping to `/ai` as the only result surface, allowing Viewer to start analysis, treating Live Pod Diagnostics as this step

**Live Pod Diagnostics** (應用即時狀態分析):
An explicit Smart Logging action that asks Robusta to diagnose the live Kubernetes pod of **exactly one** selected log document from the loaded stream buffer. That document must yield a namespace and pod from a fixed field-path allowlist (first non-empty): Log Namespace / Log Pod (`kubernetes.namespace_name` / `kubernetes.pod_name`), then `k8s.namespace` or `k8s.nameSpace`, then `k8s.podName`. Zero, many, or a row with neither pair blocks the action — this capability does not apply; the operator may use Bounded Log Analysis instead. Do not scan field names for the substrings pod/namespace, do not use `k8s.podIP`, and do not substitute Service Name, `container.name`, or `process.name`. The Smart Logging Site must have Robusta Coverage; without it the action is not offered (same idea as Robusta History not-deployed). A Robusta Cluster Key is not required — occupancy and result lookup use the Task id, not Investigation list filters. NextOps sends a Live Pod Diagnostics Task id with the trigger and later reads the async result from the Robusta Store by that id. Occupancy is one in-flight Task per Site plus the resolved namespace and pod **values** (from that allowlist) across all Operator Accounts — not per log document and not per field-path name. Other rows of that pod, and other Operator Accounts, are told it is in progress, wait, then may view; they must not start a second in-flight Task. A Task still in flight cannot be triggered again; the action only opens it. The condition for reusing a result is the Site plus that pod's namespace and pod, not the log time window, keyword, or index. When the latest Task succeeded, the action opens that result and does not trigger again, until the operator re-selects a log row — unchecking it and checking it again, even the same row — which arms one new Task. Moving the selection onto another pod that already succeeded opens that pod's result; it does not by itself start a new Task. Another Operator Account that has not re-selected sees that same latest success. A failed latest Task does not get reused; the action may trigger again. Occupancy starts only after the Robusta action trigger API accepts that Task — a failed trigger does not occupy the pod and may be retried. Occupancy stays in-flight until the Robusta Store returns a result row for that Task id — NextOps does not invent a timeout failure to unlock. A retrieved result row is success, whatever its status text says. No row yet is not that result. A trigger that does not return the row is failure. The row icon is on every visible row of that pod and opens the latest Task. Viewer must not start or re-run; they may open the window from that icon to read an in-flight or completed Task. Distinct from Bounded Log Analysis (no Orchestrator Chat Contract, no Diagnosis Answer, not a 20-row selection) and from a Robusta Investigation on Robusta History.
_Avoid_: Bounded Log Analysis, 送出分析, multi-row trigger, Robusta Investigation, AI Diagnosis, treating this as an OPSGPT turn, treating the Robusta Action Token as the per-log correlation, a second in-flight Task on the same pod, treating a repeat click after success as a new trigger before re-selection, treating the log time window, keyword, or index as this action's condition, occupancy keyed by ES `_id`, hiding another Operator Account's in-flight Task, treating occupancy as private per Operator Account, using Service Name or container/process name as trigger or occupancy for a non-K8s row, offering this action without Robusta Coverage, requiring a Robusta Cluster Key for this action, allowing Viewer to start this action, NextOps inventing a timeout failure to release occupancy, treating a retrieved result row as failure because its status text says the pod is unhealthy or still running, occupying the pod before Robusta accepts the trigger, fuzzy-matching any field whose path contains “pod” or “namespace”, parsing pod identity from message text, rewriting Document Filter Log Namespace / Log Pod to `k8s.*` paths, treating this 應用 as the Application catalog

**Live Pod Diagnostics Window**:
The Smart Logging floating surface that presents one Live Pod Diagnostics Task: pending, success, or failure from the Robusta Store row for that task id. The window title is 成功 when that result JSON is shown, and 失敗 otherwise (still waiting, trigger error, or no row). When the result row is shown, the primary reading is that diagnosis — its own status text and score, the written diagnosis, resources, node, restarts and risks, and identity — plus a link labeled 移至服務 to the pod page URL carried in the result. That link is not Service Name, and that status text is not the window title. A missing field is omitted from the reading; a stated value such as 未設定 is not missing. The raw row remains available and still omits the Robusta Action Token. Triggering opens this window immediately in pending — the wait for the async Store row happens here, not as a page-blocking spinner. If the trigger API does not accept, this window shows that trigger failure (not Store pending) and occupancy is not taken. Closing it does not cancel the Task or release occupancy; the row icon remains and reopens the same latest Task. Leaving Smart Logging or changing Site dismisses this window; occupancy for that Site + Log Namespace + Log Pod remains and the icon returns with the stream. Same interaction idea as Analysis Window (minimize, maximize, restore) but it is not an Analysis Window and has no Suggestion Marker chips. It may stay open beside an Analysis Window; neither surface paints the other's result. Only one such window at a time: triggering or opening another pod's icon retargets this window to that Task; other pods' in-flight Tasks continue and keep their row icons.
_Avoid_: Analysis Window, OPSGPT pane, Robusta Report region, painting a Diagnosis Answer here, calling 移至服務 a Service Name, using the diagnosis status text as the window title, making the raw row the only presentation, closing the Analysis Window as a side effect of opening this window, stacking one float per in-flight pod, treating close as cancel, blocking Smart Logging until the Store row exists, carrying this window across a Site change, treating leave-page as cancel

**Live Pod Diagnostics Task**:
One NextOps-issued trigger of Live Pod Diagnostics for one live Kubernetes pod, started from one log document whose allowlisted fields resolve to that namespace and pod. Its id (`task_id`) is generated for that request, sent to Robusta, and used to read the later result. NextOps persists the mapping (task id to Site and those resolved namespace and pod values) in the Local Settings Store as shared occupancy for that pod — not keyed by Operator Account, ES `_id`, or which field path supplied the values — so another account and other log rows of the same pod (ECS or `k8s.*` shape) can see an in-flight Task and later view the same result. Distinct from the Robusta Action Token (API auth, not a task id) and from a Robusta Investigation.
_Avoid_: token-as-task-id, Diagnosis Conversation id, Robusta Investigation id, browser-only mapping, per–Operator Account mapping as occupancy truth, occupancy by ES `_id`, treating Robusta's table as the only place the pod occupancy is known

**Robusta Action Token**:
The shared secret NextOps presents when calling Robusta's action trigger API. It authenticates the NextOps backend as a client. Lives in deploy env with the trigger URL, like Robusta Store credentials — not a Runtime Setting, not the Local Settings Store, not the browser. It is not per log document and is not the Live Pod Diagnostics Task id.
_Avoid_: Tool Endpoint Token, task_id, Session, mapping this token to a log row, Runtime Setting for this secret, shipping it to the Smart Logging page, painting it inside the Live Pod Diagnostics Window

**Analysis Window** (分析視窗):
The Smart Logging floating surface that presents a Bounded Log Analysis Diagnosis Answer: text summary, optional Assistant Images (0–3; absence is not a failure), and suggested follow-up questions. Clicking a suggestion immediately sends the next Orchestrator turn in the same Diagnosis Conversation (same conversation id), still inside the Analysis Window — not a navigate-away to `/ai`. Supports minimize, maximize, and restore to its prior size/position. Distinct from the OPSGPT chat pane, from Log Highlight, and from Live Pod Diagnostics results. An Analysis Window and a Live Pod Diagnostics Window may both be open.
_Avoid_: replacing the log table with a permanent split as the only chrome, painting this answer as an OPSGPT bubble by default, failing the analysis when no Assistant Image is returned, inventing a second image pipeline beside Assistant Images, requiring a trip to OPSGPT to continue follow-ups, painting Live Pod Diagnostics results as this window, closing the Live Pod Diagnostics Window as a side effect of opening this window

**Suggestion Marker** (建議提問標記):
The fixed heading 「建議提問」 in a Bounded Log Analysis or Robusta History Report Diagnosis Answer that introduces one clickable follow-up question per following line. NextOps splits on this marker only to build Analysis Window chips and Robusta Report region chips. It is a presentation delimiter, not a diagnosis schema — same idea as the Appendix Marker.
_Avoid_: free-form “next steps” heuristics, a second JSON schema for suggestions, hard-coded-only follow-ups with no model section, a second marker heading for Robusta

**Pane Maximize** (窗格放大):
On AI Diagnosis (`/ai`), the Site Health Brief and OPSGPT panes can each maximize to use the main content width and restore to the previous split ratio. Same interaction idea as Analysis Window maximize/restore, but for the two durable panes — not a floating overlay.
_Avoid_: permanently locking OPSGPT at a fixed 400px with no operator control, treating Pane Maximize as a second Analysis Window

**Log Namespace**:
The Kubernetes namespace recorded on a log document (`kubernetes.namespace_name`). It is not a first-class Smart Logging filter control or SSE param; the operator may add it as a Document Filter by clicking the value in raw log JSON. Log Tool Endpoints (`query_elasticsearch`) may still accept a dedicated `namespace` param for a compatibility period. It is not a segment of the Log Index Pattern.
_Avoid_: index-path namespace, cluster_tag, Factory Code, a Namespace combobox as Smart Logging chrome, hard-coded shared namespace menu for all Sites, treating `k8s.namespace` as this Document Filter path

**Log Pod**:
The Kubernetes pod name recorded on a log document (`kubernetes.pod_name`). Same rule as Log Namespace: not a first-class Smart Logging filter control or SSE param; may become a Document Filter from JSON; `query_elasticsearch` may still accept `pod` for a compatibility period. It is not a segment of the Log Index Pattern.
_Avoid_: index-path pod segment, container name as the primary pod scope, a Pod combobox as Smart Logging chrome, per-Site field-path catalog in v1, treating `k8s.podName` as this Document Filter path

**Cluster Operator**:
The primary human persona who uses NextOps to monitor and diagnose cluster health. Also includes DevOps/SRE engineers and developers. A Cluster Operator authenticates as an Operator Account; the persona is not itself the login identity. Exec-facing Traditional Chinese may say 運維同仁; the product noun remains Cluster Operator.
_Avoid_: Admin, user, infra engineer, treating the shared Admin Credential as a person

**Operator Account**:
A durable identity issued by NextOps that a Cluster Operator uses to authenticate to the dashboard. NextOps owns and verifies its authenticators: a Lasting Password and a Second Factor. The login key is a Username. Each Operator Account has an Operator Role that authorizes actions on the whole NextOps dashboard (not per Site). The former singular Admin Credential becomes the first Operator Account and then ceases to be a separate identity. When no Operator Account exists, deployment env may create that first one (bootstrap / break-glass); it does not remain a parallel login. An Operator Account is disabled, not deleted: disable revokes its Sessions and blocks login; Username and Operator Email stay reserved. A Platform Owner may enable it again; old Sessions are not restored. The last Platform Owner cannot be disabled or demoted.
_Avoid_: user, admin, IAM user, account (unqualified), a second always-on admin secret beside Operator Accounts, treating the Tool Endpoint Token as a person, treating Gateway Employee Id as the Operator Account, logging in with email, hard-deleting an Operator Account as a personnel action, a custom personnel-field schema on the account

**Username**:
The unique, immutable login key of an Operator Account. A Platform Owner sets it when creating the account. It may look like an employee id by convention; NextOps does not sync a company directory. Distinct from Gateway Employee Id (the shared LLM whitelist field), from Operator Email, and from Operator Display Name. `OPSGPT` (case-insensitive) must not be issued: that string is the OPSGPT Participant display name, not a login.
_Avoid_: email as the login key, renaming in place, treating Gateway Employee Id as Username, using Session id as the Diagnosis Trace actor, creating an Operator Account named OPSGPT, treating Operator Display Name as the login key

**Operator Email**:
The required, unique contact address stored on an Operator Account. A Platform Owner sets it at creation and may change it later. It is not a login key, not a recovery channel, and NextOps does not send mail in this phase.
_Avoid_: logging in with email, email password reset, SMTP from NextOps, letting the Operator Account change its own Operator Email

**Operator Display Name**:
The human-readable name a Platform Owner stores on an Operator Account so Cluster Operators can recognize who the account is. Required when creating a new Operator Account; once set, a Platform Owner may change it but must not clear it to empty. Accounts created before this field, and the env-seeded first Platform Owner, may leave it empty until a Platform Owner fills it. Not unique across accounts (homonyms are allowed). Not a login key, not a mention key, and not synced from a company directory. Must not equal `OPSGPT` (case-insensitive). Trimmed length 1–64 when set. Accounts list search matches Username, Operator Email, and Operator Display Name. Control label in Traditional Chinese may say 姓名.
_Avoid_: Full Name as the product noun, 姓名 as the glossary term, treating this as Username, requiring uniqueness, letting the Operator Account change its own Operator Display Name, using this as the Operator Chat @ mention key, a Platform Owner–defined custom field catalog for personnel attributes, clearing a set Operator Display Name back to empty, inventing a required bootstrap env for the display name

**Temporary Password**:
A system-generated password shown once to a Platform Owner when creating an Operator Account or resetting its password. It is not stored in recoverable form after that display. The next login must replace it with a Lasting Password, then enroll a Second Factor. A password reset also revokes that account’s Sessions and clears its Second Factor.
_Avoid_: Owner-chosen first password, emailing the Temporary Password, keeping the Temporary Password as the Lasting Password, resetting password without clearing the Second Factor

**Lasting Password**:
The Operator Account password after the Temporary Password is replaced. At least 12 characters and must not equal the Username. Distinct from Temporary Password, Second Factor, and the Tool Endpoint Token.
_Avoid_: email reset, keeping the Temporary Password, matching Username

**Operator Role**:
A named authorization bundle assigned to an Operator Account — exactly one of Platform Owner, Operator, Application Developer, or Viewer. It applies to the entire NextOps dashboard — Global Matrix, every Site, Smart Logging, Alert Center, Robusta History, AI Diagnosis, Operator Chat, Application Catalog, Application Online, and admin surfaces. It is not Site-scoped. Distinct from the Cluster Operator persona and from Site Binding (a diagnostic convenience, not a permission boundary). First-phase accounts do not stack roles and do not use custom permission matrices.
_Avoid_: site-scoped role, tenant, IAM policy document, treating Site Binding as authorization, a separate role per Site, stacking multiple Operator Roles on one Operator Account

**Platform Owner**:
The Operator Role that may create, disable, enable, and reset other Operator Accounts (including Username, Operator Email, and Operator Display Name at creation), change Runtime Settings, revoke others’ sessions, clear a Login Lockout, and read fleet-wide login and config audit and Diagnosis Traces. May clear another Operator Account’s Second Factor (forcing re-enrollment); must not clear its own Second Factor without the current TOTP or a Recovery Code. The env-seeded first Operator Account is a Platform Owner. The last remaining Platform Owner cannot be disabled or demoted. Owner is not a surveillance role for Operator DMs or OPSGPT DMs — those stay two-party; diagnosis governance is Diagnosis Traces.
_Avoid_: Admin, superuser, a parallel Admin Credential, treating every Cluster Operator as a Platform Owner, using 2FA reset as a self-bypass, hard-deleting an Operator Account, an admin UI that opens other people’s DMs

**Operator**:
The Operator Role for day-to-day dashboard work: Global Matrix, Site Detail, Smart Logging, Alert Center (including acknowledge), Robusta History, AI Diagnosis, Operator Chat (including OPSGPT turns from chat), Application Catalog (including Application Registration and Application Unregistration), and Application Online. May change its own authenticators (Lasting Password needs the current Lasting Password and Second Factor). Must not manage other Operator Accounts or Runtime Settings, and must not view Diagnosis Traces. Distinct from the Cluster Operator persona (a Viewer is still a Cluster Operator).
_Avoid_: Admin, using this word for the human persona, conflating with Platform Owner

**Application Developer**:
The Operator Role for bringing services online through Application Online. May open Application Online and (once Project Membership exists) fill Spec for membership Projects, and may change its own authenticators. Must not start an AI Diagnosis turn (including OPSGPT from chat), acknowledge alerts, change Runtime Settings, manage Operator Accounts, view Diagnosis Traces, or use other ops-admin write surfaces that Viewer cannot. May read Global Matrix / Smart Logging / Alert Center / Robusta History like Viewer. Distinct from Operator and from Viewer.
_Avoid_: IDP as the sidebar label, treating this as a Site-scoped role, letting Developer diagnose or administer the fleet, stacking with Operator

**Viewer**:
The Operator Role that may read the same dashboard surfaces as Operator but must not acknowledge alerts, start an AI Diagnosis turn (including from Operator Chat), start a Robusta History Report turn (generate or follow-up), start Live Pod Diagnostics, perform Application Registration, perform Application Unregistration, view Diagnosis Traces, or change settings, accounts, or authenticators other than those required to sign in. A Viewer may open Application Online read-only (no write controls). A Viewer may read the Application Catalog (Application name and GitLab Project path) but must not start Application Registration or Application Unregistration. A Viewer does not see GitLab Access or GitLab Read Access. A Viewer may open a Live Pod Diagnostics Window from the row icon to read an in-flight or completed Task (shared occupancy). A Viewer may read and write human Operator Chat messages (Public Room and Operator DMs) and may read OPSGPT replies others posted in the Public Room, but must not invoke the OPSGPT Participant or send in an OPSGPT DM. A Viewer does not see another Operator Account's Robusta History Report. Exec-facing Traditional Chinese may say 只能看的帳號; the product noun remains Viewer.
_Avoid_: guest, anonymous, intern (as a role name), a Viewer-only silent chat, letting Viewer start OPSGPT turns from 聊天, letting Viewer start Live Pod Diagnostics, letting Viewer register an Application, letting Viewer unregister an Application

**Application Online** (應用上線):
The NextOps module where Application Developers and Operators bring a Service through Spec, central Git MR, Dev验证, and promotion. Sidebar label is 應用上線 — not IDP. Distinct from Global Matrix observability and from AI Diagnosis.
_Avoid_: IDP as the operator-facing name, replacing the five ops sidebar items, treating this as a sibling product outside NextOps

**Application Online Store**:
The sidecar SQLite that persists Application Online domain rows — Project, Project Membership, Spec drafts, artifacts, Resource Requests, Environment Bindings, pins, Runtime Check — across process restart. Distinct from the Local Settings Store and from the Application Catalog Store. Tests open it on a temp path like other sidecar stores.
_Avoid_: IDP Store (as the product name), writing Application Online rows into Local Settings, jenkins_build_info as this store

**Project** (Application Online):
A NAME_SPACE container inside Application Online under which Spec, membership, and later promotion work hang. Distinct from a GitLab Project and from an Application Catalog Application.
_Avoid_: treating NAME_SPACE as a Site, merging with GitLab Project path, storing Project rows in Local Settings

**Project Membership**:
The link that places an existing Application Developer Operator Account on a Project. Only Operator and Platform Owner may add or remove membership. An Application Developer sees only Projects they belong to; Operator, Platform Owner, and Viewer see every Project (Viewer read-only). Developers cannot invite others or change Operator Roles.
_Avoid_: stacking roles via membership, letting Developer manage membership, inventing accounts that are not Operator Accounts

**NAME_SPACE**:
The stable lowercase identifier of an Application Online Project (letters, digits, hyphens). Distinct from Release Version and from IMAGE_TAG.
_Avoid_: free-form display titles as the primary key, uppercase namespaces, treating IMAGE_TAG rollback as a NAME_SPACE change

**Service Deploy Spec**:
The Application Online form that captures how a Service should build and land — starting with the Pipeline block (NAME_SPACE, APP_NAME, GITLAB_URL, Promotion Path, template family, PACKAGING_COMMAND, default branch/tag, optional K8s namespace). A draft lives in the Application Online Store and is not a published Git SHA or job pin. Distinct from Excel 服务部署配置信息收集表 as the source of truth and from Resource Request sheets.
_Avoid_: treating a draft as a published pin, requiring Resource Request sheets to save a Pipeline-block draft, stuffing APP_NAME with -dev/-prod suffixes, equating K8s namespace with NAME_SPACE

**Resource Request**:
Optional Spec sheets (files, networks, middleware, VM, DB, MinIO, domains, …) describing platform resources the Service needs. An empty sheet means not needed — not an incomplete required block. Filling them must not gate Pipeline-block draft completeness or (later) opening Dev. Password-like fields are stripped and never stored for Git publish; Bindings come later.
_Avoid_: requiring Resource Requests to save Spec drafts, treating empty sheets as validation failures, putting passwords/kubeconfig into the draft payload that will publish to Git

**Environment Binding**:
Allocated platform facts per Environment (host, namespace, …) for filled Resource Request kinds, recorded in the Application Online Store by Operator or Platform Owner. Secrets stay out of publishable Git artifacts (password-like fields are stripped). Opening QA requires Binding for every filled Resource Request on QA and later hops on the Promotion Path; empty sheets do not block; Dev validate stays unblocked.
_Avoid_: putting passwords in central MR, treating Site Binding as Environment Binding, blocking Dev on missing Binding, letting Developer record Binding

**Config Check**:
Computed in NextOps from Spec vs Environment Binding vs overlay/env (including off-catalog Dockerfile FROM warnings). It reminds the team what to finish before QA release. Distinct from Prometheus Site Resource Health (Weihai is not a Site).
_Avoid_: using Site Resource Health as Config Check, treating Config Check warnings as Dev blockers

**Promotion Path**:
One of four catalog ladders on a Service Deploy Spec: `dev→qa→uat→prod`, `dev→uat→prod`, `dev→prod`, or `dev→qa→prod`. Jobs exist only for hops on the path. Operator release of the next hop pins the central-repo SHA (and for `promote`, SOURCE_IMAGE) from the previous green run — not from `main` HEAD after a later Spec merge until re-released. Changing template family requires a Dev re-walk. QA release also requires the Environment Binding gate.
_Avoid_: tribal shortcut paths outside the catalog, inventing extra hops in v1, creating QA/UAT jobs for `dev→prod`, letting Developer release, letting Prod consume an unreleased Spec merge SHA

**base-images catalog**:
The published allowlist of Harbor base image references used as Dockerfile `FROM`. This slice ships a fixture list; later it is the central pipeline repo `base-images.yaml`. A hand-edited (已手工調整) Dockerfile may keep an off-catalog FROM with a Config Check warning; a clean generate must not.
_Avoid_: free-form unofficial bases without dirty/warning, embedding PACKAGING_COMMAND in the Dockerfile

**已手工調整**:
The dirty flag on a generated Dockerfile or Kustomize preview after a human edit. When generating fields change, save must choose regenerate-from-fields or keep-manual — never silent overwrite or silent ignore.
_Avoid_: silently regenerating over hand edits, silently keeping stale content when fields change without an explicit choice

**central pipeline MR**:
The GitLab merge request opened by the IDP machine account against `jenkins-deployment-pipeline` under `deploy/<NAME_SPACE>/<APP_NAME>/` (Dockerfile, pipeline-params, Kustomize). Templates stay at repo root — not copied per app. Merge is a human Operator GitLab action; the machine account must not merge `main`. Secrets never appear in the MR diff.
_Avoid_: bot merge of main, copying Jenkinsfiles into the app tree, putting passwords/kubeconfig in MR files, treating NextOps as the merge UI

**published SHA**:
The central-repo commit SHA recorded in the Application Online Store after the Spec MR merges. It is the Dev job pin. An unpublished draft must not become a job pin. Later environments pin from the previous hop’s green run — this slice only creates the Dev job.
_Avoid_: pinning a draft SHA, creating QA/UAT/Prod jobs at merge, storing Dockerfile or PACKAGING_COMMAND on the KubeSphere job

**在 Dev 驗證**:
The explicit IDP control that enqueues the Dev job at the pinned published SHA with the Spec default branch/tag. Application Developers may press it only for membership Projects; Operator/Owner for any; Viewer never. Merge does not auto-enqueue. Ladder success for Dev means Jenkins through `kubectl apply`.
_Avoid_: auto-run on merge, validating an unmerged draft SHA, letting Viewer trigger, requiring a missing Dev database for apply-green in this slice

**Step-up Confirmation**:
A fresh Second Factor challenge while a Session is already valid, required before a high-risk action: changing a Runtime Setting, creating/disabling/enabling/resetting an Operator Account, clearing someone else’s Second Factor, clearing a Login Lockout, or revoking someone else’s Session. Changing one’s own Lasting Password is not Step-up Confirmation: it requires the current Lasting Password and the current Second Factor.
_Avoid_: password-only step-up for platform actions, treating a valid Session as enough for Runtime Setting changes, changing someone else’s authenticators with only the acting Owner’s password

**Second Factor**:
A TOTP authenticator enrolled on an Operator Account. After a Temporary Password login the Operator Account must set a Lasting Password, then enroll a Second Factor, before the dashboard can be used; afterwards both Lasting Password and Second Factor are required. Distinct from the Lasting Password and from the Tool Endpoint Token. Passkeys and company SSO are later authenticators on the same Operator Account, not this phase.
_Avoid_: optional 2FA, SMS OTP, email OTP, forcing only Platform Owner to enroll

**Recovery Code**:
A one-time code issued when a Second Factor is enrolled. It can satisfy the Second Factor if TOTP is unavailable. Shown once to the Cluster Operator, stored hashed. Using one requires immediate TOTP re-enrollment. Distinct from the password, from env re-seed (the store-level break-glass when no Operator Account exists), and from a Platform Owner clearing someone else’s Second Factor.
_Avoid_: email reset, SMS reset, an emergency password, a parallel Admin Credential

**Session**:
A server-issued, revocable login for one Operator Account after password and Second Factor succeed. Identified by an opaque id (not the literal cookie value `authenticated`). It records Client IP, user-agent, created time, last seen, and whether it is still valid. Multiple browser tabs on one device share one Session; another device creates another Session. Distinct from an HTTP or SSE connection. The Tool Endpoint Token is not a Session. Any authenticated request, including SSE (Alert, Smart Logging, Operator Chat), refreshes last seen. A Session ends on logout, revoke, 8 hours idle, or 24 hours after creation — whichever happens first. NextOps counts active Sessions per Operator Account and across the whole dashboard; it does not cap how many may exist at once. A new login does not revoke older Sessions. The owning Operator Account may list and revoke its own Sessions; a Platform Owner may list and revoke any Session. Sessions persist in the Local Settings Store across process restart; restart is not a mass logout.
_Avoid_: connection, SSE stream, the boolean `authenticated` cookie, treating each tab as a Session, treating a Tool Endpoint call as a Session, treating SSE as exempt from idle, kicking an old Session because a new one started, treating a process restart as revoke-all, treating Chat SSE as a second login, GitLab Access, GitLab Read Access

**Operator Chat** (聊天):
The Cluster Operator collaboration surface: one Public Room, Operator DMs, and OPSGPT DMs. Header slide-over beside the Alert bell; not a primary sidebar page and not AI Diagnosis. Product noun in docs is Operator Chat; the control label is 聊天. Message and roster labels prefer an Operator Account’s Operator Display Name when set, otherwise Username; @ mentions and audience identity stay on Username.
_Avoid_: Slack, chatbot, IM, 訊息中心, 協作平台, `/chat` as primary nav, a support bubble, merging with 運維助手 / the OPSGPT pane, treating this as AI Diagnosis, using Operator Display Name as the @ mention key

**Release Notes** (更新說明):
The Cluster Operator surface for authored notices about what changed in a NextOps dashboard deploy. Visible to every authenticated Operator Role, including Viewer; absent on the login page. A header popover (left of 聊天) that stays available even when caught up: tooltip and popover chrome show the running Release Version; the unread prompt is a dot from Release Notes Last-Read, not a count — Last-Read does not hide older Releases. Every Release shipped in this image is listed, newest first, with Release Notes grouped by Release Version; opening a Note expands its Detail and Operational Guidance in that same popover. A Release and its Release Notes ship in the dashboard image — not a Runtime Setting, not written in SRE admin after deploy, not a slide-over, not a sidebar page, not a Direct URL Route, not Alert Center, not Operator Chat, not Documentation Explorer, and not a git commit log.
_Avoid_: changelog, What's New (as the product name), 版本變更通知 (as the product name), in-dashboard `/docs`, treating commits as the notices, merging with 聊天 or 告警, treating this as a cluster/ops bulletin board, Platform Owner composing notes after the image is running, a numeric badge, a second Operator Chat-sized panel, hiding older Releases once Last-Read catches up, Owner-only notes, a login-page prompt, hiding the icon when caught up, printing the semver as a third header clock

**Release**:
The grouping unit of Release Notes, identified by a Release Version. Published only when there is at least one Release Note; a rebuild with no new Notes is not a new Release. Once published, a Release is frozen in later images: the next image may only add a new Release Version — it must not delete a past Release, rewrite its Notes, or append Notes onto an older Version. A copy fix is a new patch Release. Distinct from BUILD_SHA, which remains the image tag for Image-Only Deploy.
_Avoid_: BUILD_SHA as the operator-facing version, a flat ungrouped stream of notes, a rolling blog with no version, a named epic that spans many versions, an empty Release, rewriting a shipped Version in a later image, adding Notes to an already-published Version

**Release Version**:
The Cluster Operator-facing semver of a Release (`MAJOR.MINOR.PATCH`). Numbering starts at `1.0.0` with the first Release that includes this surface; earlier dashboard history is not backfilled as Releases. It changes when a new Release is published, not on every image rebuild — several BUILD_SHAs may run the same Release Version. Increment **minor** for a new operator-visible capability or surface, **patch** for a fix, copy change, or small tweak, **major** only when an existing operator path breaks (login, sidebar IA, a removed page). Not library API semver.
_Avoid_: showing the image fingerprint as this version, git describe, CalVer, bumping because BUILD_SHA changed, a marketing name with no number, bumping major for an internal refactor, using patch as the only ever-incremented digit, `0.x` numbering, backfilling pre-notes dashboard history as Releases

**Release Note**:
One authored item in a Release. It has a Release Note Summary, required Release Note Detail, and optional Operational Guidance. Those three are Traditional Chinese, matching dashboard control labels — not a bilingual catalog. Distinct from a git commit and from a Documentation Explorer page.
_Avoid_: changelog entry, commit message, treating a whole deploy as one note, treating guidance as a substitute for Documentation Explorer, English-only notes, a bilingual catalog in the popover

**Release Note Summary** (摘要):
The list-row presentation of a Release Note: a title plus one short sentence, both plain Traditional Chinese. Not markup.
_Avoid_: dumping the whole body onto the list, using a git commit subject as this summary, markdown in the list row

**Release Note Detail** (細節):
The required what-changed body of a Release Note, shown when that Note is opened in the popover. Constrained markup only: paragraphs, lists, and same-origin NextOps path links. Following a same-origin link navigates in this tab and closes the popover. Not a second markdown dialect, not HTML, not Diagnosis Answer chrome, not Assistant Images.
_Avoid_: git diff, a PR description dump, making this optional, full markdown, OPSGPT tables or Report Callouts, images, opening a new tab for a same-origin path

**Operational Guidance** (操作引導):
Optional instructions on a Release Note for what the Cluster Operator should do in NextOps (where to click, which route). Shown in the popover with the Detail. Same constrained markup as Release Note Detail (paragraphs, lists, same-origin NextOps path links). Following a same-origin link navigates in this tab and closes the popover. Distinct from Documentation Explorer.
_Avoid_: requiring Documentation Explorer to understand a change, requiring guidance on every Note, treating this as a runbook SPA, outbound-only links with no in-popover text, full markdown, HTML, images, opening a new tab for a same-origin path, leaving the popover open over the destination

**Release Notes Last-Read**:
The newest Release Version an Operator Account has opened on the Release Notes surface. A running Version newer than this lights the header prompt. An Operator Account that has never opened the surface has no Last-Read, so the first Release lights the dot. Persisted per Operator Account in the Local Settings Store — not browser-only. Distinct from Operator Chat last-read (per room) and from Alert Center unread.
_Avoid_: per-note unread, a browser-only seen flag, nagging once per Session, a fleet-wide "everyone has seen this Version"

**Public Room** (公共):
The single fleet-wide Operator Chat room. Every Operator Account may read and write human messages there. Not Site-scoped and not a channel the operator creates.
_Avoid_: #general, 大廳, 艦隊 as the room name, per-Site rooms, operator-created channels, a shared diagnosis thread

**Operator DM**:
A 1:1 Operator Chat thread between exactly two Operator Accounts. Only those two may read or write it. A Platform Owner has no product UI to open another pair’s Operator DM.
_Avoid_: group DM, channel, Owner surveillance as a feature, treating host sqlite access as a product read path

**OPSGPT DM**:
A 1:1 Operator Chat thread between one Operator Account and the OPSGPT Participant. Multi-turn diagnosis for that account; its Diagnosis Conversation is not the `/ai` OPSGPT room. Viewer cannot send. An Operator DM never becomes a diagnosis turn.
_Avoid_: sharing conversation id with `/ai`, inviting the OPSGPT Participant into an Operator DM, a fleet-shared diagnosis room, requiring `@OPSGPT` inside this DM

**OPSGPT Participant**:
The synthetic Operator Chat counterpart for the Diagnosis Orchestrator (stable id `participant:opsgpt`, not an Operator Account). Display name OPSGPT. Public Room invoke is an explicit `@OPSGPT` or mention chip; OPSGPT DM sends are turns without a prefix. Username `OPSGPT` must not be issued.
_Avoid_: treating OPSGPT as an Operator Account, Dify Agent, Robusta as a chat participant, firing a turn on the mere word OPSGPT, a second idle-chat LLM, an Agent directory of bots

**Login Event**:
An append-only record of an authentication attempt (success, failure, lockout, or unlock) against an Operator Account, including time and Client IP. Distinct from a Session (the live login that a success may create) and from the Config Audit Log (Runtime Setting changes, not logins). An Operator Account may read its own Login Events; a Platform Owner may read all of them. Records expire after 90 days; expiry does not revoke a still-valid Session. The login API does not reveal whether the username exists; a Login Event may still record an unknown-username attempt for Platform Owner review.
_Avoid_: putting login attempts only in process logs, using Config Audit Log as login history, counting SSE connects as logins, showing other people’s Login Events to Operator or Viewer, telling the client that a username is unknown

**Login Lockout**:
A temporary block on creating a Session for one Operator Account after five failed authentications in 15 minutes. The block lasts 15 minutes, then clears by itself. Distinct from disabling the Operator Account. A Platform Owner may clear a Login Lockout early. The login endpoint also throttles by Client IP so spraying many accounts is not free. It is not a permanent lock, not a CAPTCHA, and the login page does not load a third-party CAPTCHA widget.
_Avoid_: permanent lock until another person unlocks, disabling the Operator Account on failed password, using lockout as the only brute-force control, Google reCAPTCHA or Turnstile as a login dependency

**Client IP**:
The address stored on a Session and a Login Event, and used for login throttling. By default it is the TCP peer. `X-Forwarded-For` (or equivalent) is used only when a trusted reverse proxy is explicitly configured. Untrusted clients cannot pick their own Client IP. When the Public URL sits behind a shared-host reverse proxy, that proxy is the one to trust — not an arbitrary client. Distinct from Gateway Employee Id and from Username.
_Avoid_: always trusting X-Forwarded-For, always ignoring a reverse proxy, treating the proxy’s own address as the operator when a trusted proxy is configured, trusting forwarded headers without that proxy overwriting client-supplied values

**Dify Integrator**:
Retired role: the engineer who configured the Dify Chatflow / Agent and Tool Endpoint MCP Adapter under the former Dify-based Diagnosis Orchestrator. Not an operating role now that Dify is not a Diagnosis Orchestrator path.
_Avoid_: treating Dify Studio skills as required for the Diagnosis Orchestrator

**Production Dify Compatibility Floor**:
Retired constraint: the minimum Dify version once required for Dify-based artifacts. It does not constrain the LangGraph Diagnosis Orchestrator.
_Avoid_: assuming a Dify version floor still governs `/api/ai/query`

**Dify Agent**:
The former Diagnosis Orchestrator implementation powered by Dify Chatflow. Retired; the Diagnosis Orchestrator role and Tool Endpoint boundary remain with LangGraph. Not an emergency fallback.
_Avoid_: AI bot, chatbot, LLM wrapper, assuming Dify remains available as Orchestrator Mode

**Orchestrator Chat Contract**:
The NextOps-owned request/response shape between `/api/ai/query` and the Diagnosis Orchestrator: operator query, optional Site Binding, optional conversation id, streamed Diagnosis Answer (and optional Assistant Images). Not the Dify `/chat-messages` API. Phase I streaming is NextOps SSE after the AiBridge Gateway returns a complete chat body (the gateway SOP has no token stream). The browser still talks only to NextOps; NextOps remains the auth and stream boundary. Operator Chat (Public Room `@OPSGPT` and OPSGPT DM) is another NextOps client of this contract — not a second diagnose API and not a token stream on Chat SSE.
_Avoid_: Dify Chat API as the long-term contract, browser calling the orchestrator directly, leaking Tool Endpoint JSON to the browser, requiring native gateway SSE for Phase I, a second diagnose API that posts Site Health Brief JSON, a separate conversation id for generate-report, a second LLM path for Operator Chat

**Diagnosis Trace** (診斷鏈條):
The observability record of **one Orchestrator Chat Contract turn** on the LangGraph Diagnosis Orchestrator: the Cluster Operator's prompt for that turn, the Operator Account that started it (recorded as that account's Username — not the Session, not Gateway Employee Id), its Trace Observations, and Trace Usage. A Diagnosis Conversation groups many Traces by conversation id; the conversation is not itself a Trace. Turns the UI does not paint as OPSGPT bubbles (generate-report, Bounded Log Analysis) still produce a Trace. Operator Chat Public Room `@OPSGPT` and OPSGPT DM turns still produce a Trace. A turn that fails before a Diagnosis Answer still produces a Trace. If the initiating Operator Account is missing, the Trace is still written and marked unattributed. Only a Platform Owner may view Traces, in a dedicated SRE admin category (診斷鏈條)—not on Upstream Diagnosis and not on AI Agents. Data stays in the NextOps deployment, in the Diagnosis Trace Store. Distinct from the Diagnosis Conversation Store (continuity for the next turn, not observability), from the Operator Chat Store (human IM text, not the tool chain), and from System Behavior Tracking (HTTP health of NextOps itself). NextOps does not ship or embed the Langfuse product for this surface.
_Avoid_: Langfuse (as the shipped product), Skill, dumping LLM payloads into System Behavior Tracking or the Config Audit Log, treating a Diagnosis Conversation thread as one Trace, one Trace per Gateway call, omitting failed turns, emitting Traces from a Dify orchestrator path, letting Operator or Viewer read Trace payloads, burying Traces on Upstream Diagnosis or AI Agents, blocking a Diagnosis Answer until the Trace is persisted, using Session id or Gateway Employee Id as the Trace actor, treating Operator Chat messages as Traces

**Trace Observation**:
A first-class step on a Diagnosis Trace. Exactly three kinds: a Tool Endpoint call, a Context Reduction, and an AiBridge Gateway call. Graph-internal bookkeeping is not a Trace Observation; if it fails the turn, the failure belongs on the Trace, not as a fourth kind. Each kind stores a Trace Payload, not raw HTTP.
_Avoid_: Skill, LangGraph node as the observation unit, System Behavior Tracking events as Trace Observations, treating Context Reduction as a Tool Endpoint

**Context Reduction**:
The Trace Observation immediately before an AiBridge Gateway call: Diagnosis Conversation history is reduced into the gateway's single-turn `question` (short summary plus current-turn tool JSON). A Platform Owner can see the prompt before and after reduction. It is not a Tool Endpoint and not a named compression algorithm.
_Avoid_: compression algorithm, Skill, sending unbounded historic tool JSON into the gateway, treating this as the Diagnosis Conversation Store itself

**Trace Payload**:
The request and response content stored on a Trace Observation: logical fields — system prompt, the Cluster Operator's prompt, Context Reduction before and after, model, Tool Endpoint JSON bodies, gateway response, and Gateway Employee Id. Not raw HTTP. Never includes the Tool Endpoint Token, passwords, or Authorization headers. If a field exceeds the observability storage cap, it is truncated and that Trace Observation is marked truncated. Truncation applies only to stored observability; it does not shrink what the AiBridge Gateway receives.
_Avoid_: raw HTTP dumps, storing the Tool Endpoint Token on a Trace, metadata-only Observations, redacting Gateway Employee Id, silent truncation, shrinking the live gateway prompt to match the store cap, replacing bodies with hashes only

**Trace Usage**:
Input token count, output token count, and USD cost on a Diagnosis Trace (from its AiBridge Gateway Trace Observation). When the gateway returns usage, counts are **recorded**; otherwise NextOps **estimates** them. The Trace must show which. USD uses the Model Rate Table in effect when the Trace is written; changing the table does not rewrite existing Traces. Estimated cost is not a bill.
_Avoid_: treating estimates as invoices, refusing to write a Trace until the gateway returns usage, ignoring gateway usage when it is present, recalculating historical cost on read

**AiBridge Gateway** (Gemini Control Tower):
The company LLM inference HTTP service used by the Diagnosis Orchestrator. Primary chat entry is `POST {base}/api/v1/unified/chat` as `multipart/form-data` with `employee_id`, `question`, `model`, optional `system_prompt` and optional `file`. The JSON body resembles OpenAI Chat Completion (`choices[0].message.content`) but is **not** a drop-in OpenAI `/v1/chat/completions` (no messages array, no Bearer API key, no native tool_calls in this SOP). Default service base is the corporate `gemini-ct` host; value is a Runtime Setting, not hard-coded in application logic.
_Avoid_: Dify Chat API, calling the legacy 8400-port Gemini API, treating this as OpenAI function-calling, embedding Prom/ES in the gateway

**Gateway Employee Id**:
The `employee_id` field the Diagnosis Orchestrator sends to the AiBridge Gateway (whitelist identity, not a NextOps login). Deployment env may **seed** it once into the Local Settings Store when empty; process restart must **not** overwrite a stored value. Operators may change it later via Runtime Setting. Distinct from Operator Account and the Tool Endpoint Token.
_Avoid_: employ_id (SOP field is `employee_id`), Dify API key, Cluster Operator username, baking the id into source, env overwriting the store on every boot, treating Gateway Employee Id as the Diagnosis Trace actor

**Dify Chat Credentials**:
Retired NextOps → Dify Chat API settings (`DIFY_BASE_URL`, `DIFY_API_KEY`). They are not a Runtime Setting. Distinct from the Tool Endpoint Token, which remains.
_Avoid_: PUBLIC_DEFAULT_DIFY_*, Workflow run URL as the chat base, keeping Dify keys as live orchestrator config

**Tool Endpoint Token**:
The shared secret (`NEXTOPS_DIFY_TOKEN`) that the Diagnosis Orchestrator (or the Tool Endpoint MCP Adapter on its behalf) presents when calling NextOps Tool Endpoints. Direction is Orchestrator → NextOps.
_Avoid_: Dify API key, app key, session cookie, single merged “Dify token”, a separate long-lived identity that bypasses Tool Endpoint auth, storing this token on a Diagnosis Trace

**Runtime Setting**:
An SRE admin parameter that, once saved, applies on the NextOps server immediately (survives process restart via server-side persistence) rather than living only in the browser. Saving or restoring a Runtime Setting requires Step-up Confirmation and an explicit notice that the change takes effect at once. Includes AiBridge Gateway settings (base URL, Gateway Employee Id, model), the Tool Endpoint Token, the Model Rate Table, GitLab Read Access, and the GitLab OAuth Client. Format checks and a live connectivity probe apply before persist or restore where a live upstream exists. Step-up confirmation is not owned by the AI Agents form; Operator Account management is a separate concern. Orchestrator Mode and Dify Chat Credentials are not Runtime Settings. Robusta Coverage, Robusta Cluster Key, and Robusta Store credentials are not Runtime Settings. GitLab Access is not a Runtime Setting. The GitLab OAuth redirect URI is not a Runtime Setting. The Public URL (Public Host and Public Base Path) is not a Runtime Setting.
_Avoid_: demo-only admin fields, deploy-env-only knobs with no admin path, silent localStorage “configuration”, burying password change inside AI Agents configuration, env overwriting Gateway Employee Id on every boot, Dify Chat Credentials as live config, Robusta Coverage or Robusta Cluster Key as live admin knobs, GitLab Access as a Runtime Setting, treating the GitLab OAuth redirect URI as a Runtime Setting, treating the Public URL as a Runtime Setting

**Model Rate Table**:
A Runtime Setting that maps each LLM model id to USD rates for input and output tokens. It prices Trace Usage when a Diagnosis Trace is written. Changing it does not rewrite existing Traces. It is not fetched from the public internet.
_Avoid_: live public list-price fetch, recalculating historical Trace cost, treating table USD as an invoice

**Orchestrator Mode**:
Retired Runtime Setting that once chose LangGraph vs Dify for `/api/ai/query`. The Diagnosis Orchestrator is LangGraph only. Not two parallel chats, and not a Dify emergency fallback.
_Avoid_: dual-running Dify and LangGraph for one operator turn, keeping a Dify switch as a Runtime Setting

**Admin Credential**:
Legacy name for the singular dashboard login username and password. It is not kept as a parallel identity: it migrates into the first Operator Account. After that, login, step-up, and account changes are Operator Account operations. Env re-seed is allowed only when no Operator Account exists.
_Avoid_: keeping a second admin login beside Operator Accounts, env overwriting Operator Accounts on every restart, embedding password change in AI Agents settings

**Local Settings Store**:
The on-process SQLite database that NextOps starts with the app and uses as the durable home for Operator Accounts, Sessions, Login Events, Runtime Settings, the Config Audit Log, GitLab Access per Operator Account, per–Operator Account Smart Logging preferences (Index Watchlist and Log Categories, keyed with Site), shared Live Pod Diagnostics Task occupancy (Site + Log Namespace + Log Pod to task id, not keyed by Operator Account), and Release Notes Last-Read per Operator Account — see ADR-0022. Deployment env remains bootstrap and break-glass only (first Operator Account when none exist). On first open, existing `.data` JSON Runtime Setting files may be imported once into the store. Runtime secrets in the store are protected by host filesystem controls in this phase (not a separate application-level encryption key).
_Avoid_: Jenkins MySQL (`DB_*`) for NextOps settings, Robusta Store for NextOps settings, browser localStorage as server truth for Watchlist, Log Categories, Live Pod Diagnostics Task mappings, or Release Notes Last-Read, plaintext password files as the primary store, requiring NEXTOPS_SETTINGS_KEY in this phase, storing Diagnosis Conversations, Diagnosis Traces, Operator Chat messages, Release Notes bodies, or Applications in this store, treating Smart Logging preferences as fleet-wide Runtime Settings

**Diagnosis Conversation Store**:
The sidecar SQLite that holds Diagnosis Orchestrator conversation threads (ids, recent turns, optional summaries) so the same OPSGPT room can continue after process restart. Distinct from the Local Settings Store, the Diagnosis Trace Store, the Operator Chat Store, and the Application Store. AiBridge Gateway remains single-turn; the store is how NextOps/LangGraph reconstitutes `question` / `system_prompt` context. Generate-report turns belong in the same thread as visible OPSGPT Q&A even when the UI does not paint them. A Robusta History Report and its follow-ups use a separate thread per Operator Account and Site Binding — not the OPSGPT room on `/ai`, and not a Site-wide shared report. An OPSGPT DM uses a separate thread per Operator Account from `/ai` (and from Robusta History). A thread is deleted when the operator clears the room or changes Site Binding (Robusta History also ends the thread on Robusta History Window change or a confirmed new generate); otherwise it is dropped after a short retention window (Phase I: 7 days or 20 turns, whichever comes first). Gateway context is a short summary plus the current turn’s tool JSON, not unbounded historic tool payloads. Clearing or expiring a conversation does not delete Diagnosis Traces. Operator Chat human transcripts are not this store.
_Avoid_: putting chat transcripts in the Local Settings Store, Dify conversation_id as the durable source of truth, sending full historic tool JSON unbounded into the gateway, treating chats as long-term work-order records, treating this store as Diagnosis Trace observability, sharing one conversation id between `/ai` and Robusta History, sharing one conversation id between `/ai` and Operator Chat, one shared Robusta History Report for the whole Site, using this store as the Public Room log

**Diagnosis Trace Store**:
The durable home for Diagnosis Traces in the NextOps deployment. Distinct from the Diagnosis Conversation Store, the Local Settings Store, the Operator Chat Store, and the Application Store. Clearing a room, changing Site Binding, or expiring a Diagnosis Conversation does not delete Traces. Traces expire after 30 days; success and failure share that window. There is no turn-count cap. Only a Platform Owner reads it via SRE admin. Persist must not block the Orchestrator Chat Contract turn: if a write fails, the Diagnosis Answer still returns and that Trace may be missing or incomplete.
_Avoid_: Elasticsearch as the Trace store, mixing Traces into conversation threads, Operator Chat messages, or Runtime Settings, letting an operator-cleared chat wipe observability, 7-day conversation retention as the Trace window, unbounded Trace retention, failing the diagnosis when the Trace Store is unavailable, a Runtime Setting that disables Trace writes

**Operator Chat Store**:
The sidecar SQLite that holds Operator Chat messages (Public Room, Operator DMs, OPSGPT DMs) and per–Operator Account last-read cursors. Distinct from the Local Settings Store, the Diagnosis Conversation Store, the Diagnosis Trace Store, and the Application Store. Human messages expire after 30 days. Restart does not wipe the store. OPSGPT DM diagnosis continuity still lives in the Diagnosis Conversation Store; tool-chain observability still lives in the Diagnosis Trace Store.
_Avoid_: Local Settings Store for transcripts, Diagnosis Conversation Store as the IM, in-memory Map like Alert Center, Elasticsearch, unbounded Slack-like archive, putting Tool Endpoint JSON on chat messages, Application Store as the IM

**Application Store**:
The sidecar SQLite that holds Applications — Application name, GitLab Project path, and the facts of Application Registration (including the registering Username, not the Session). Application Unregistration deletes that row; it does not delete the GitLab Project. Distinct from the Local Settings Store, the Diagnosis Conversation Store, the Diagnosis Trace Store, and the Operator Chat Store. Deleting the Local Settings Store (break-glass re-seed of Operator Accounts) does not delete Applications. GitLab Access and GitLab Read Access are not this store. See ADR-0033.
_Avoid_: Local Settings Store for Applications, Jenkins MySQL, GitLab as the only NextOps catalog, IDP Store as the product name, storing GitLab Access or GitLab Read Access here, deleting a GitLab Project because the Application row is gone

**Config Audit Log**:
An append-only record of Runtime Setting change attempts and outcomes (saved, rejected, test failed), retained on the NextOps server for operator review (dedicated SRE admin audit view) and also emitted as structured process logs. Covers Runtime Settings such as AiBridge Gateway settings, the Tool Endpoint Token, the Model Rate Table, MySQL proxy transport, GitLab Read Access, and the GitLab OAuth Client. Secret values are never stored in the log—only that a secret field changed.
_Avoid_: Upstream Diagnosis, System Behavior Tracking, Elasticsearch as the sole audit store, plaintext API keys in logs, burying audit only inside the AI Agents form, Diagnosis Trace

**Global Matrix Dashboard**:
The landing view (`/`) that shows cross-site KPIs, pipeline health, and a card grid of all Sites with aggregate resource utilization. A compact refresh countdown in the page header (dashboard only) shows time until the next poll and can be clicked to refresh immediately; the interval is configurable in SRE admin settings (15/30/60 seconds). Exec-facing Traditional Chinese may call this 統一觀測大盤 or Single Pane of Glass for that landing view. It does not show AI Diagnosis turns and does not execute remediation.
_Avoid_: Home page, overview dashboard, main dashboard, 管控大屏, treating this page as a live AI 處置 feed

**Site Detail**:
A per-Site operational view at `/sites/[siteId]` showing live Prometheus metrics, node status, alert summary, and site metadata used by AI Diagnosis. Provides a CTA into 運維助手 with `?siteId=` preselected.
_Avoid_: Site page, cluster view, region detail

**Alert Center**:
The real-time alert feed (`/alerts`) that ingests Alertmanager webhook payloads and streams updates to the browser via SSE. Drill-down from the 24H alert trend chart passes an **active window** (`activeFrom` / `activeTo`): alerts that were **firing at any point during that hour**, not only those whose `startsAt` falls inside it.
_Avoid_: Alert page, notification center, alert dashboard

**Active window**:
A time interval used to filter alerts by overlap — an alert matches if it was active at any moment between `activeFrom` and `activeTo`. Used by the trend chart bins and Alert Center drill-down.
_Avoid_: time range, hour filter, started-in-range

**運維點檢** (Daily Check):
The primary-sidebar page (`/ops-check`, label 運維點檢) for the 雲平台服務點檢報告. It lists check items worst-first, opens a row for PromQL evidence and per-cluster values, shows a report preview and delivery log, and paints a 14-day status heatmap from stored history only. A day with no stored run is empty (無資料), not a guessed status. CaaS numbers come from the daily-check service's Prometheus queries (`PROMETHEUS_URL`, production value taken from `PUBLIC_DEFAULT_PROMETHEUS_URL`). SaaS rows are demo data and carry the 示範資料 tag. 寄送 Gmail and 發 Google Chat are explicit actions; opening the page does not send. The runbook button records an approval request and does not execute the cleanup. 交給 GE Agent 分析 links to 運維助手 (`/ai`) with the item and date; if that entry is absent the control is disabled and marked TODO. The page does not invent a confidence score.
_Avoid_: painting SaaS demo figures as live CaaS, filling the heatmap for days that were not run, sending mail as a side effect of 立即點檢, executing a runbook from the drawer, a fake AI conclusion on the drawer

**Robusta**:
An external Kubernetes automation product, deployed per Site (Robusta Coverage on the catalog). NextOps reads its investigation history; Robusta is not the Diagnosis Orchestrator, not AI Diagnosis, not Alert Center, and not an Operator Chat participant. A Site without Robusta Coverage has no Robusta Investigations.
_Avoid_: treating Robusta as OPSGPT, merging Robusta history into Alert Center, calling Robusta's AI "AI Diagnosis", treating 廠區 as a separate Robusta namespace, treating Robusta as a chat Robot

**Robusta Investigation** (Robusta 調查):
One AI investigation session produced by Robusta at one Site. It is the historical unit on Robusta History. Bound to a Site by Robusta Cluster Key. Its status is the value on that row in the Robusta Store — NextOps does not invent a parallel taxonomy. Distinct from a NextOps Diagnosis Answer, AI Diagnosis turn, and Diagnosis Trace.
_Avoid_: AI Diagnosis, Diagnosis Answer, OPSGPT, treating a script as its own history row, a fleet-wide investigation with no Site, Pipeline Timeout / Aborted / Failure as Investigation statuses, 操作紀錄 as a separate record type

**Robusta Investigation Step** (調查步驟):
A script or tool action that ran inside one Robusta Investigation. Shown as a child of that Investigation, not as a first-class history row. Phase I expand shows step name, Store outcome, and time, loaded when that Investigation is expanded — not shipped with the list page. Step outcome is the Store value; missing fields stay empty. Raw script output is not a Phase I expand column. When the Store is the default k8s event-log tables (no separate step table), expand projects compact stored diagnosis/status columns: the column name is the step name and the column value is the outcome.
_Avoid_: Robusta Playbook Run (as a sibling list), Trace Observation, Tool Endpoint, treating a Step as an Alert, filling empty step fields from unrelated columns, dumping raw step logs in the Phase I expand, attaching every Step to the list page payload, treating `ROBUSTA_DB_NAME` as a table, dumping heap/thread/app log blobs as steps

**Cluster Operations Snapshot**:
NextOps SQL aggregates over the Robusta Store for the selected Site and Robusta History Window: mix by kind (cpu_autoscale is an action, not a failure), Autoscale Success, repeat-offender workloads (Deployment replica suffix stripped; StatefulSet ordinals kept), node pressure, Store status/reason values, and cross-kind workloads. It is not a Diagnosis Answer. The list strip shows mix plus the top three workloads. Subset counts do not add chips or a second strip; the operator clicks the cpu_autoscale mix chip to cycle between all-cpu_autoscale and Autoscale Success. A Snapshot count (the mix chip currently selected, including that chip's count mode) may constrain the Investigation list for the same window; the snapshot itself stays on the unfiltered window. Generate uses that full unfiltered snapshot plus stratified exemplars (at most 20, at least one per kind when present, preferring repeat offenders then recency) — not the filtered list, not the newest 20 rows of one kind, and not blocked when the window has more than 20 rows.
_Avoid_: sending newest-20 Investigations as the generate corpus, generating from the filtered Investigation list, blocking generate at 20 list rows, treating cpu_autoscale as a failure, dumping heap/thread/app log blobs or stored `ai_diagnosis` into the snapshot or generate corpus, painting this strip as a Diagnosis Answer, recounting the snapshot from the filtered list, 操作紀錄 as a separate record type, a second mix chip or extra strip row for Autoscale Success

**Autoscale Success** (CPU 擴容成功):
The Cluster Operations Snapshot count of cpu_autoscale Investigations in the Robusta History Window whose Store status is `scaled`. Distinct from the mix count of all cpu_autoscale rows (including non-success Store statuses such as `hit_safety_cap`). NextOps does not invent a parallel success taxonomy. The cpu_autoscale mix chip keeps the Store kind name and cycles in place between all-cpu_autoscale and Autoscale Success, showing **全部** or **成功** beside the matching count; other mix chips keep Store kind names. Unknown URL kinds are treated as no filter.
_Avoid_: Pipeline Timeout / Aborted / Failure as this count, treating every cpu_autoscale row as success, treating `hit_safety_cap` as success, a second chip beside mix for this count, collapsing the whole mix into one cycling number, translating kind names in this phase

**Robusta History Kind Filter**:
The Snapshot mix chip currently constraining the Investigation list. Empty means the full Robusta History Window. A chip click applies that kind (cpu_autoscale uses its current all vs Autoscale Success mode) and returns to page 1. Re-clicking cpu_autoscale cycles all ↔ Autoscale Success. Re-clicking any other kind clears the filter. Clicking the strip's unfiltered window total clears a cpu_autoscale filter. Lives on the page URL with Site, Robusta History Window, and page — refresh and share keep it. Changing Site or Robusta History Window clears it. Not stored in this Session. Viewer may use it. The list's total and pages are the matching Investigations, not a client-side hide of the current page. Zero matches is a valid empty list (not-deployed and Upstream Error State stay as they are). Does not change the Cluster Operations Snapshot or the generate corpus.
_Avoid_: a second record type, filtering the Snapshot itself, treating top-workload rows as this filter in this phase, a third cpu-chip state for “clear”, sessionStorage for this filter, restoring a Kind Filter after a Site or Window change, treating zero matches as 未佈署 or an upstream outage, paginating the unfiltered window then hiding rows

**Robusta History** (Robusta 調查歷史):
The primary-sidebar page (`/robusta`) that lists Robusta Investigations for a selected Site in the Robusta History Window **above** the Robusta Report region. It sits in the sidebar directly below Alert Center, label 「Robusta 調查歷史」. Site is required. If exactly one Site has Robusta Coverage and a Robusta Cluster Key, the page selects it on entry; if several do, the page restores the last Site from this Session or waits for a pick. The Robusta History Kind Filter is on the URL with Site, window, and page; it is not restored from this Session. The list refreshes on entry, Site change, Robusta History Window change, and explicit refresh — not SSE and not dashboard polling. Refreshing the list does not clear the Robusta Report region (a stale-report notice if the window's event count moved on). A Robusta History Kind Filter change also does not clear that region. The list shows the window (paginated, 50 Investigations per page), not a 20-row cap. A Cluster Operations Snapshot strip sits above the list. A Snapshot count may constrain that list via the Robusta History Kind Filter; the operator is still looking at Robusta Investigations, not a second record type. Without a report, the list uses the full pane height. A Site without Robusta Coverage shows a not-deployed empty state, not an Upstream Error State. A Kind Filter with zero matches shows a valid empty list, distinct from the unfiltered window's empty list and from not-deployed. The row shows Investigation time, title, Store status, and step count — newest first. Expanding a row loads that Investigation's Robusta Investigation Steps then. Phase II generate control sits in the former Generate Hint slot (Viewer still must not start a turn). Distinct from Alert Center, AI Diagnosis, and Diagnosis Trace.
_Avoid_: Direct URL Route, burying it under Site Detail, treating an empty non-covered Site as an upstream outage, painting the report in OPSGPT, a second time window for the report, an Analysis Window as the report chrome, a left-right split like `/ai`, inserting this item beside 運維助手, landing on an empty “please choose a Site” when exactly one Site is covered, SSE or dashboard polling for this list, capping the list itself at 20 rows, infinite scroll for this list, blocking generate because the window has more than 20 rows, dumping every Store column onto the row, a column picker, attaching every Step to the list page payload, 操作紀錄 as a separate list beside Investigations, remembering the Kind Filter in this Session

**Generate Hint** (可生成報告提示):
Phase II uses this slot for the working generate control on Robusta History. Operator and Platform Owner get an explicit generate that posts the Cluster Operations Snapshot plus stratified exemplars through the Orchestrator Chat Contract. Viewer sees a cannot-generate notice in the same slot and must not start a turn. Shown only when the selected Site has Robusta Coverage and a Robusta Cluster Key — not on the not-deployed empty state and not on Upstream Error State.
_Avoid_: treating the notice as a failed generate, auto-calling the Diagnosis Orchestrator, painting OPSGPT, a second LLM teaser on `/ai`, showing the control on a Site without Robusta Coverage, blocking generate at 20 list rows, generating from the filtered Investigation list

**Robusta Report region**:
The lower remaining space on Robusta History for a Robusta History Report and its follow-ups. Absent until the operator generates. While present, it keeps a usable remainder even if the Investigation list above is tall. Visual Summary scrolls inside this region; Detail Appendix sits at the end of it and starts collapsed. Suggestion Marker chips (and a follow-up field) send the next turn in this region. Stays until a confirmed new generate, Site change, or Robusta History Window change (a stale-report notice if the list moved on inside the same window). A Robusta History Kind Filter change does not clear this region and does not show a stale-report notice.
_Avoid_: Analysis Window, painting this region in OPSGPT, allowing the report region to collapse to zero under a tall list, one-open-only accordion that hides the list while a report is open, requiring a trip to `/ai` to continue follow-ups, a left-hand report pane, treating the generate control as this region, treating a Kind Filter change as a stale report or a new conversation

**Robusta History Window**:
The lookback on Robusta History, based on Investigation time. Allowed values: 24, 48, or 168 hours. Default 168 hours (7 days). The list, the Cluster Operations Snapshot, and the Robusta History Report use the same window.
_Avoid_: a separate report range, Pipeline Metrics Window as this page's control, unbounded history, an arbitrary calendar range in this phase

**Robusta History Report** (調查建議報告):
The Diagnosis Answer produced on Robusta History by an explicit generate, plus later answers in the same Diagnosis Conversation. Same Orchestrator Chat Contract as AI Diagnosis and Bounded Log Analysis. Shown only in the Robusta Report region — Visual Summary, optional Assistant Images, and Suggestion Marker chips — not OPSGPT. Viewer must not start generate or follow-up turns. Distinct from the Robusta Investigation text Robusta already stored. The generate turn's corpus is the Cluster Operations Snapshot for the selected Site in the Robusta History Window plus stratified compact exemplars (cap 20), always for the unfiltered window — a list filter does not shrink or replace this corpus. Payload has no stored `ai_diagnosis` and no heap/thread/app log blobs. NextOps attaches that projection as turn context — the Diagnosis Orchestrator does not retrieve Investigations itself. Follow-ups continue that conversation id; they do not attach a new corpus. A confirmed new generate starts a new conversation and replaces the region. The thread is per Operator Account and Site Binding — not shared across accounts, not the `/ai` OPSGPT room.
_Avoid_: a second LLM path to the AiBridge Gateway, auto-generate on page load or Site change, treating Robusta's own investigation write-up as this report, jumping to `/ai` as the result surface, checkbox selection of individual Investigations, sending newest-20 of one kind, sending the filtered Investigation list as the generate corpus, sending full step transcripts, letting the orchestrator pull Investigation history on its own, painting this in an Analysis Window, sharing the `/ai` OPSGPT conversation id, a Site-wide shared report wall, blocking generate when the window has more than 20 rows

**Robusta Store**:
The durable home of Robusta Investigations, Robusta Investigation Steps, and Live Pod Diagnostics result rows. NextOps reads it; it does not write Investigations or diagnostics rows — Robusta writes those after NextOps triggers Live Pod Diagnostics over the action API. Distinct from the Pipeline Metrics MySQL, the Local Settings Store, the Diagnosis Conversation Store, the Diagnosis Trace Store, the Operator Chat Store, and the Application Store. The browser never talks to it — only NextOps does, via a session-authenticated API that is not a Tool Endpoint. It uses the same MySQL CONNECT Runtime Setting as Pipeline Metrics — not a third proxy switch. Direct Upstream Access applies to this pool. `ROBUSTA_DB_NAME` is the MySQL database (for example `ai-ops`), not a table. The default physical mapping for History is five Site event-log tables (`k8s_*_logs`) filtered by `cluster_id` matching the Robusta Cluster Key. Live Pod Diagnostics result lookup is by Task id, not that five-table mapping. Override with `ROBUSTA_STORE_SCHEMA` JSON only when the Store is an investigation + step table pair.
_Avoid_: jenkins_build_info, DB_* as this connection, Local Settings Store, Runtime Setting for its credentials, exposing Robusta credentials to the browser, a Tool Endpoint that opens Robusta storage to the Diagnosis Orchestrator, a separate Robusta MySQL CONNECT toggle, treating `ROBUSTA_DB_NAME` as a table name, assuming a table named `investigation`, NextOps INSERT into diagnostics rows, treating Live Pod Diagnostics as an Investigation list filter

**Upstream Diagnosis**:
An operator-facing registry (`/admin/diagnosis`) of recent failures reaching external data stores (Elasticsearch, Prometheus, MySQL including Pipeline Metrics and the Robusta Store, GitLab) during API proxy calls.
_Avoid_: Health check, error log, service monitor

**System Behavior Tracking**:
A complete backend event trail of request/response behavior (success and failure) used to debug runtime issues when containerized services misbehave. It complements Upstream Diagnosis by preserving request context for investigation, not just incident alerts.
_Avoid_: debug print, temporary console log, ad-hoc trace, Diagnosis Trace (LLM chain observability)

**System Status Signal**:
A computed health assessment derived from System Behavior Tracking telemetry (success rate, latency, retry pressure, and drop signals) that classifies each dependency as Healthy, Degraded, or Critical.
_Avoid_: system current status, runtime feeling, rough health

**Upstream Diagnostic**:
A structured upstream-failure record emitted when NextOps cannot reach an external dependency (Prometheus, Elasticsearch, MySQL, AiBridge Gateway, GitLab). It is written to the Upstream Diagnosis registry and to container stderr for log collectors.
_Avoid_: random error print, silent upstream failure

**Direct Upstream Access**:
Production connectivity policy where a running NextOps process reaches Prometheus, Elasticsearch, MySQL, Alertmanager, the Diagnosis Orchestrator, and GitLab on the deployment network without HTTP CONNECT proxy or tunnel routing. Every Production deploy path (shsdgx Image-Only Deploy, Helm, production compose) **applies** both runtime fetch proxy (`PUBLIC_DEFAULT_PROXY_ENABLED`) and MySQL CONNECT (`PUBLIC_MYSQL_PROXY_ENABLED`) off — leftover on-state is not an implicit decision. A Production **deploy** (not a mere process restart) also turns off any persisted MySQL CONNECT preference in the Local Settings Store unless this environment explicitly opted in; a Cluster Operator may turn MySQL CONNECT on afterwards, and that Runtime Setting survives restart until the next Production deploy. Explicit opt-in is **per switch** (fetch vs MySQL CONNECT), never a single master “allow all runtime proxies” flag. Workstation image build may still use npm/Harbor `HTTP_PROXY` — that is build-time package fetch, not a runtime proxy. Laptop `npm run dev` or a segmented network may enable either runtime proxy explicitly when direct reachability is unavailable.
_Avoid_: always-on runtime proxy, treating npm/Harbor `HTTP_PROXY` as a Production runtime setting, tunnel-by-default, binding MySQL CONNECT to fetch-proxy enablement, a combined runtime-proxy master switch, treating a leftover env file or leftover Local Settings Store flag as the Production decision, resetting MySQL CONNECT on ordinary restart, leaving shsdgx vs Helm on different runtime-proxy defaults

**Pipeline Metrics**:
Jenkins build outcomes aggregated from the central MySQL `jenkins_build_info` table, displayed as global KPIs on the Global Matrix Dashboard. Success, timeout, aborted, and failure are separate analysis categories — not interchangeable.
_Avoid_: CI metrics, build stats, Jenkins dashboard

**Pipeline Timeout**:
A build whose `build_duration` exceeds the **Pipeline Timeout Threshold**. Used only for slow-build / duration-timeout analysis. Independent of Jenkins terminal status.
_Avoid_: slow build, long-running job, SLA breach (unless explicitly configured)

**Pipeline Timeout Threshold**:
The duration in seconds above which a Build Record counts as a Pipeline Timeout. Configurable by the Cluster Operator in SRE admin (儀表板); default 300 seconds. The dashboard KPI and Pipeline Timeout Drill-down must use the same threshold.
_Avoid_: SLA, deadline, Jenkins timeout setting

**Pipeline Metrics Window**:
The lookback period for Pipeline Metrics KPIs and drill-down lists, based on `build_time`. Configurable by the Cluster Operator in SRE admin (儀表板); default 24 hours. Allowed values: 24, 48, or 168 hours. The dashboard KPI and Pipeline Timeout Drill-down must use the same window.
_Avoid_: time range, date filter, rolling window

**Cluster Operator Build**:
A Build Record triggered by a platform admin account (e.g. `mc00146`, `mc00255`, `admin`) for cluster operating tasks, not application CI. Excluded from Pipeline Metrics and Pipeline Timeout Drill-down so rates reflect application pipeline activity.
_Avoid_: system build, service account build, maintenance job

**Pipeline Aborted**:
A build terminated before completion (operator or system cancel). Identified by `build_status` in `jenkins_build_info`, not by duration. Separate drill-down and KPI from Pipeline Timeout.
_Avoid_: timeout, failure, cancelled (use Aborted)

**Pipeline Failure**:
A build that completed with a failed outcome (compile error, test failure, etc.). Identified by `build_status` in `jenkins_build_info`. Separate drill-down and KPI from Pipeline Timeout and Pipeline Aborted.
_Avoid_: timeout, aborted, broken build

**Build Record**:
One row in `jenkins_build_info` — a single Jenkins/GitLab build attempt. Uniquely identified by `app_name` + `build_number` (with `build_time` for disambiguation). Drill-down lists show Build Records; KPIs aggregate across them.
_Avoid_: pipeline run, job execution, build event

**GitLab**:
An external source-code forge. NextOps is not GitLab. Application source lives there. Distinct from Pipeline Metrics (Jenkins) and from NextOps itself.
_Avoid_: treating NextOps as a GitLab clone, GitHub, treating Pipeline as GitLab, GitLab Connection as a single merged identity

**GitLab OAuth Client**:
A Runtime Setting: the GitLab base URL plus the OAuth client id and secret NextOps presents so a Cluster Operator can obtain GitLab Access. Distinct from GitLab Read Access and from GitLab Access itself. The OAuth redirect URI is not a Runtime Setting — it follows the Public URL.
_Avoid_: GitLab Connection as a merged identity, GitLab Read Access as this client, treating the redirect URI as an admin knob, Personal Access Token as the acquisition path, registering a redirect URI for a deploy that has not enabled GitLab OAuth

**GitLab Project**:
One project on GitLab — path, visibility, and the git repository inside it. An Application points at exactly one GitLab Project. Distinct from Application (the NextOps catalog identity), from Pipeline, and from the `project_path` column on a Build Record.
_Avoid_: Application, Pipeline, treating `project_path` as the NextOps identity, GitLab Repository as a second NextOps noun

**Application** (應用):
A named software product in the NextOps catalog, identified by an Application name that is unique on the dashboard and immutable after Application Registration. Its source of truth is exactly one GitLab Project; that GitLab Project path is also unique in the catalog — one GitLab Project is not two Applications. The Application name need not equal the GitLab Project slug. This phase does not retarget an Application to a different GitLab Project. Application Unregistration removes it from the catalog so the name and GitLab Project path may be registered again. Lives in the Application Store. Distinct from Pipeline (Jenkins `app_name`), from Site, and from the running pod Live Pod Diagnostics inspects.
_Avoid_: treating Pipeline as this catalog, GitLab Project as the NextOps identity, Site as the app, Live Pod Diagnostics 應用 as this catalog, `app_name` as the Application key, one Application spanning multiple GitLab Projects, two Applications on one GitLab Project, renaming an Application, requiring the name to equal the GitLab slug, disabling an Application while keeping the name reserved

**Application Catalog** (應用目錄):
The primary-sidebar Cluster Operator surface that lists Applications from the Application Store for the whole dashboard — not per Operator Account. Application Registration and Application Unregistration are the actions on this surface, not a separate product, not a Direct URL Route, and not SRE admin. The control label is 應用目錄; the catalog unit is Application. A Viewer may read the list and must not start Application Registration or Application Unregistration. GitLab Access and GitLab Read Access are not shown on this surface. Distinct from Live Pod Diagnostics (應用即時狀態分析) and from Pipeline Timeout Drill-down.
_Avoid_: Direct URL Route, burying it under admin, header chrome, treating 應用即時狀態分析 as this list, two routes for 簡化 vs 進階, a per-operator private catalog, hiding this sidebar item from Viewer, showing GitLab Access or GitLab Read Access on the list, deleting a GitLab Project from this list

**Application Registration** (應用登記):
The Cluster Operator action that creates an Application and points it at one GitLab Project — either a new GitLab Project, or an existing GitLab Project whose history is left intact. Creating writes exactly one first commit on the default branch from a zip or folder the operator supplies, using GitLab Access. Attaching does not write source. There is no durable file tree and no second push in this phase. One surface; a 簡化 / 進階 toggle changes which fields are shown, not which action runs. 簡化 (default): create or attach, Application name, GitLab Project path, and for create a zip or folder. 進階 adds visibility, default branch name, description, a .gitignore template, and the first-commit message. It uses GitLab Access for GitLab writes and for proving the operator may attach that GitLab Project, and to grant the GitLab Read Access identity read on that GitLab Project when missing. If that grant cannot be made, or if the Application name or GitLab Project path is already in the catalog, registration fails — NextOps does not keep an Application it cannot read, and does not duplicate either key. Distinct from a NextOps Session and from later runtime-planning forms.
_Avoid_: upload (unqualified), GitLab clone UI, Web IDE, two routes for 簡化 vs 進階, forcing a rewrite of existing history, an empty GitLab Project with no Application, treating this as Pipeline Metrics, using GitLab Read Access to create or write, succeeding when NextOps cannot read the GitLab Project, a second source write as this action, license / CI / MR / Issue chrome as this action

**Application Unregistration** (取消登記):
The Cluster Operator action that removes an Application from the Application Store so the Application name and GitLab Project path may be registered again. It does not delete the GitLab Project, does not rename, and does not retarget. Operator and Platform Owner may unregister; Viewer must not. This phase does not revoke GitLab Read Access membership on GitLab. Distinct from disabling an Operator Account (which keeps Username reserved) and from Application Registration.
_Avoid_: deleting the GitLab Project, disable-and-reserve, using GitLab Read Access to write, treating this as a GitLab destroy, letting Viewer unregister

**GitLab Access**:
A Cluster Operator's delegated GitLab credential, bound to that Operator Account. The operator obtains it by authorizing NextOps on GitLab (OAuth) via the GitLab OAuth Client, not by pasting a token or a GitLab password. Application Registration uses it to create a GitLab Project, perform the first source write, and prove the operator may attach an existing GitLab Project. If it expires during that action, only GitLab is challenged again — the NextOps Session stays. Persisted in the Local Settings Store with that Operator Account — not in the Application Store. Distinct from Session, from GitLab Read Access, and from the Tool Endpoint Token.
_Avoid_: Session, GitLab Read Access, a NextOps-owned write identity on GitLab, the Operator Account password as the GitLab login, Personal Access Token as the acquisition path

**GitLab Read Access**:
NextOps's own machine credential on GitLab. It is read-only and there is one for the whole dashboard — not one per Operator Account or per Application. A Platform Owner sets it as a Runtime Setting. Application Registration must leave the GitLab Project readable by this identity; later forms that read a GitLab Project use this, not GitLab Access. It remains after an Operator Account is disabled and after a Session ends.
_Avoid_: Session, GitLab Access, the GitLab OAuth Client, a write-capable NextOps identity on GitLab, a per-operator token as the platform read path, a new token minted per Application

**Pipeline**:
The CI application identified by `app_name` in `jenkins_build_info`. Timeout drill-down groups Build Records by Pipeline first, then lists individual builds for the selected Pipeline. Distinct from Application.
_Avoid_: Jenkins job, GitLab project (repo granularity is `project_path`), Application

**Pipeline Timeout Drill-down**:
A two-level operator view triggered from the Global Matrix Dashboard timeout KPI: (1) Pipeline summary ranked by timeout count/rate per `app_name`, (2) Build Record list for one Pipeline. Filtered by the same duration threshold and time window as the KPI.
_Avoid_: build explorer, Jenkins console, CI dashboard

**Upstream Error State**:
When Prometheus, Elasticsearch, MySQL (Pipeline Metrics or the Robusta Store), Alertmanager, or GitLab are unreachable, the UI shows explicit error states (red borders, error icons, and fetch-failure messages) instead of placeholder data. Operators must fix upstream connectivity — there is no embedded fallback dataset. A Site without Robusta is not this state.
_Avoid_: demo mode, fallback mode, graceful degradation, backup data, treating Robusta-not-deployed as an upstream outage

**Direct URL Route**:
An operator-facing page that is a registered route but intentionally omitted from the primary sidebar. Reached by typing the URL, bookmarks, runbook links, or contextual in-page links (e.g. the Global Matrix Dashboard diagnosis banner, timeout KPI drill-down). Current examples: `/admin/diagnosis` (Upstream Diagnosis), `/pipelines/timeouts` (Pipeline Timeout Drill-down). `/ai` (運維助手 / AI Diagnosis) is primary sidebar navigation, not a Direct URL Route. Application Catalog (應用目錄) is primary sidebar navigation, not a Direct URL Route. Operator Chat is layout chrome (header 聊天), not a Direct URL Route and not a sidebar item. On a shared host, operators type these after the Public Base Path; the route identity remains the NextOps path.
_Avoid_: hidden page, orphan route, missing nav bug, adding `/chat` to hide Operator Chat from the header, hiding Application Catalog from the primary sidebar

**Public URL**:
The one browser address Cluster Operators use to open NextOps. On a shared host it is HTTPS, Public Host, and Public Base Path. HTTPS is terminated in front of NextOps; NextOps does not deploy that reverse proxy. The app-root form includes a trailing slash after Public Base Path; a request that omits that slash is redirected to the slash form. The GitLab OAuth redirect URI follows the Public URL (Public Base Path plus `/api/auth/gitlab/callback`). Distinct from Direct Upstream Access. Not a Runtime Setting.
_Avoid_: a second operator-facing HTTP IP:port as a product entry, treating this as a Runtime Setting, hard-coding one company hostname into the product, shipping Nginx inside Image-Only Deploy as the Public URL terminator, treating `/nextops` without a following slash as a second canonical root, treating browser HTTPS as Direct Upstream Access

**Public Host**:
The hostname of the Public URL. Distinct from Public Base Path and from the Tool Endpoint Base URL. Set per deployment and can change without a source change; not a Runtime Setting; not one frozen company hostname.
_Avoid_: collapsing host and path into one knobs-in-admin field, using the in-cluster Tool Endpoint host as the browser host, baking one company hostname into product source

**Public Base Path**:
The URL path prefix of the Public URL on a shared host. Empty means NextOps is at `/` on that host (laptop, dedicated host). The shared-host deploy uses `/nextops` (leading slash, no trailing slash). Sidebar links and Direct URL Routes sit under this prefix. Distinct from Public Host. Set per deployment and ships in the dashboard image when it changes; not a Runtime Setting. That image's NextOps process serves only under this prefix — in-cluster callers use the same prefix on the Tool Endpoint Base URL.
_Avoid_: treating TLS as requiring a subdirectory, second-level directory as a protocol, a dedicated hostname that still mounts at `/` as if it had a prefix, `/nextops/` as the canonical form, treating this as a Runtime Setting, editing it in SRE admin after the image is running, a second prefix-free listen path on the same process

**Appearance Theme**:
An operator-selectable visual mode for the entire NextOps UI — Dark, Light, or System (follow the device color scheme). Default is Dark. Dark keeps the cool blue-slate ops look; Light uses neutral surfaces. Covers color surfaces and status colors (error, success, warning, info) so meaning stays readable in every mode; does not change font-family. Brand accent color stays constant across modes.
_Avoid_: Color Theme, Display Theme, dark mode (as the name of the feature)

**Documentation Explorer**:
The static, offline-capable documentation product (文件探索中心) for browsing curated NextOps docs, searching them in-app, viewing a doc↔code-surface graph, and seeing soft Drift when routes/APIs and reference docs disagree. Separate from the operator dashboard — not a Direct URL Route inside NextOps.
_Avoid_: help center, in-app /docs, docs site (generic), GitNexus wiki

**Image-Only Deploy** (shsdgx VM only):
The deployment model for the internal shsdgx VM: build the container image on the operator workstation, transfer only the image tar plus minimal runtime files (`docker-compose.yml`, server-side `.env.prod`), and start containers on the VM — without rsyncing source code, `docs/`, or agent/context markdown (`README.md`, `CLAUDE.md`, `AGENTS.md`, etc.). After deploy, leftover source trees on the VM may be removed. Build-time env uses a workstation copy aligned with shsdgx `PUBLIC_*`; runtime secrets stay on the VM. Image tag follows `BUILD_SHA`. A successful deploy keeps the previous `nextops:<BUILD_SHA>` image and records current/previous tags on the VM so SRE can roll compose back to that image. Rollback changes `IMAGE_TAG`, not Release Version. Does **not** apply to Kubernetes (Helm) or generic Docker production — those use registry/charts or their own compose policies.
_Avoid_: applying image-only to all environments, rsync source to shsdgx for production, baking server secrets into the image, pruning the previous image as a post-deploy default, treating Release Version as the rollback key
