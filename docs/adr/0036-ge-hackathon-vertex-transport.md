# GE hackathon model calls use Vertex Gemini

On the `ge-hackathon` deploy, Diagnosis, inspection notes, the Robusta runbook, and the STRIDE check call Vertex AI `generateContent` with Workload Identity. The existing AiBridge call site grows a transport switch. Helm sets `GEMINI_TRANSPORT=vertex`. The browser still talks only to NextOps.

The factory path stays the AiBridge multipart `employee_id` contract when the transport is not vertex. A Gemini API key and the corporate `gemini-ct` host are not the GE path: the key is the wrong enterprise identity, and that host is not reachable from the GKE Workload Identity pool.

## Considered Options

| Option | Outcome |
| --- | --- |
| Vertex `generateContent` via Workload Identity (chosen) | One model path for every GE scene, using the runtime service account already created by `scripts/ge/bootstrap.sh` |
| Keep AiBridge for Diagnosis and call Vertex only for new scenes | Two brains in one demo, and the GKE pod still depends on `aiot.corp.example.com` |
| Generative Language API with an API key | Blocked as the enterprise identity; the hackathon cluster is already set up for Workload Identity |

## Consequences

- Do not delete the AiBridge client on this branch.
- Do not send Gateway Employee Id to Vertex.
- Inspection does not add a second LLM client beside this switch.
