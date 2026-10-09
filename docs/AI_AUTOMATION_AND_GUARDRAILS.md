# AI Automation, Structured Guardrails & Controlled Tools (Phase 8)

## 1. Architectural Scope & Security Safeguards

Phase 8 elevates the workflow orchestrator to an enterprise-grade AI automation engine with strict runtime security boundaries:
- **No Arbitrary Code Execution**: `eval()`, child process spawning (`exec`, `spawn`, `fork`), and arbitrary shell execution are strictly prohibited and detected by runtime guardrails.
- **Anti-SSRF Protection**: External network calls are strictly restricted to HTTP/HTTPS protocols with automatic blocking of private subnets (`127.0.0.1`, `localhost`, `10.x.x.x`, `192.168.x.x`, `169.254.169.254`).
- **Human-in-the-Loop Governance**: Real-world side effects can be intercepted by `human_approval_gate` nodes requiring explicit sign-off.
- **Fail-Fast Defense**: Any malicious prompt injection or code pattern triggers immediate fail-fast termination before downstream side effects execute.

---

## 2. Guardrail Validation Engine (`backend/src/guardrails/`)

The `GuardrailValidator` performs validation across three layers:
1. **Safety Blocklist**:
   - Rejects code execution signatures (`eval\s*\(`, `<script>...</script>`, `exec\s*\(`, `rm\s+-rf`).
   - Supports configurable regex / keyword blocklists.
2. **Length & Size Bounding**:
   - Prevents prompt injection buffer exhaustion and token-bloat attacks.
3. **Structured Schema Conformance**:
   - Checks presence of required output fields.
   - Enforces strict type boundaries (`string`, `number`, `boolean`, `object`, `array`).

---

## 3. Controlled Workflow Nodes (`backend/src/nodes/tools/`)

### 1. `ai_guardrail`
- Validates upstream AI outputs.
- Routes to `valid` branch on success, or `invalid` branch (or fail-fast abortion) on violations.

### 2. `controlled_http_request`
- Dispatches outgoing HTTP requests with anti-SSRF protections.
- Bounded to `GET` and `POST` methods with strict timeouts.

### 3. `human_approval_gate`
- Evaluates human approval decisions.
- Routes to `approved` or `rejected` branches based on approval metadata.
