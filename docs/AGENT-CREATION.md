# Creating agents

Existing Admin agents are preserved. Creating a new agent does not migrate or replace their workflows.

From Agents → Add New Agent, choose:

- **Actual Agent:** a blank canvas containing only a fixed Start. Add Agent, End, If/Else, While, User Approval and API steps from the AI Agent Tools palette. Model settings are inside each Agent step. Connect the right-hand output to the next step; bottom handles are dependencies, not execution order.
- **Super Agent:** Info → named Agent with Model, Memory, Tools and Agents. Connect saved specialists using + Agents. Each specialist uses its own saved definition and permissions. Create & connect an agent is also available in this picker.

Actual Agent collects a name and opens the blank builder; configure instructions and model after adding an Agent step. Super Agent collects name, purpose, instructions and model. Both atomically save the agent and graph. Creation from the specialist picker connects the new agent to the current workflow instead.

## Actual Agent execution

Start is fixed and cannot be deleted. Only connected execution steps run. Each step passes its output forward. Agent steps call the selected OpenAI model and their connected dependencies. This does not register a separate external AI provider.

If / Else compares either the original user message or previous step result with configured text. Comparisons are case-insensitive Contains, Equals or Does not contain. Connect both branch handles. These conditions are routing decisions, never authorization decisions. JavaScript expressions and natural-language model evaluation are not supported.

Custom API steps accept approved HTTPS endpoints, GET or POST, JSON request inputs, and encrypted API credentials through existing API settings. Add the endpoint origin to EASSIST_ALLOWED_ORIGINS before contacting it. GET inputs can fill explicit URL placeholders. POST uses the saved JSON body; it is not silently generated from chat.

POST stops the flow and shows an exact request approval. Confirmation executes that request once; it does not automatically resume downstream steps. Shared and published previews cannot execute external writes. Tokens expire, are bound to owner and saved graph, and cannot be replayed. After an uncertain provider response, inspect the external system before submitting another write.

While repeats its Body while an explicit text comparison matches, then follows Done. Connect the last body step back to While. Maximum iterations are 1�20; reaching the limit stops with an error. User Approval pauses a private run and stores its continuation server-side. Approve or Reject consumes a graph-bound, expiring token once and resumes the selected branch without replaying prior steps. Shared and published previews cannot approve workflow steps. Flows reject cycles outside While, ambiguous fan-out and missing branches and have a 24-step budget retained across approval continuation. Model calls retain the existing call and output limits. Existing legacy graphs are not automatically converted.

## Verification

Automated checks cover creation and transaction rollback, origin and role checks, actual-agent execution, branch selection, disconnected nodes, graph errors, exact custom API approvals, one-use tokens, shared write denial and existing Super Agent delegation/publication/sharing. Fixtures use fake model and external API responses. A user's custom endpoint still requires testing with that real provider and credentials.
