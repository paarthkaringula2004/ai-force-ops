import assert from "node:assert/strict";
import { load } from "./helpers/load-ts.mjs";
const { normalizeWorkflowGraph, workflowPreviewGraph, edgesBeforeConnection } =
    load("lib/workflow-graph.ts");
const node = (id, type) => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: id },
    selected: true,
});
const nodes = [
    node("start", "StartNode"),
    node("a", "AgentNode"),
    node("b", "AgentNode"),
    node("tool", "ReferenceNode"),
    node("branch", "IfElseNode"),
    node("end", "EndNode"),
];
const edges = [
    { id: "start-a", source: "start", target: "a" },
    { id: "top", source: "a", target: "tool", targetHandle: "attachment", selected: true },
    { id: "left", source: "a", target: "tool" },
    { id: "second-agent", source: "b", target: "tool" },
    { id: "if", source: "branch", target: "end", sourceHandle: "if" },
    { id: "else", source: "branch", target: "end", sourceHandle: "else" },
];
const original = JSON.stringify({ nodes, edges });
const graph = normalizeWorkflowGraph(nodes, edges);
assert.deepEqual(
    graph.edges.map((e) => e.id),
    ["start-a", "top", "second-agent", "if", "else"],
);
assert.equal(graph.edges.find((e) => e.id === "top").targetHandle, "attachment");
assert.deepEqual(normalizeWorkflowGraph(graph.nodes, graph.edges), graph);
const preview = workflowPreviewGraph(nodes, edges);
assert.ok(preview.nodes.every((n) => !n.selected && !n.dragging));
assert.ok(preview.edges.every((e) => !e.selected));
assert.equal(
    JSON.stringify({ nodes, edges }),
    original,
    "Projection never mutates stored/editor graph",
);
assert.equal(preview.nodes.length, nodes.length);
assert.equal(preview.edges.length, 5);
console.log(
    "PASS: duplicate tool attachment projections collapse to one; separate agents and If/Else branches remain intact; preview clears editor selection without mutating stored graph.",
);

const oldLeft = normalizeWorkflowGraph(nodes, [
    { id: "legacy-left", source: "a", target: "tool", targetHandle: null },
]);
assert.equal(
    oldLeft.edges[0].targetHandle,
    "input",
    "An old unnamed left target must resolve to the left, not the first/top target",
);
for (const targetHandle of ["input", "attachment"]) {
    const selected = {
        id: "new-wire",
        source: "a",
        target: "tool",
        sourceHandle: null,
        targetHandle,
    };
    const rewired = normalizeWorkflowGraph(nodes, [
        ...edgesBeforeConnection(nodes, graph.edges, selected),
        selected,
    ]);
    const wire = rewired.edges.filter((e) => e.source === "a" && e.target === "tool");
    assert.equal(wire.length, 1);
    assert.equal(
        wire[0].targetHandle,
        targetHandle,
        "The newly chosen side wins over the old attachment",
    );
    assert.ok(
        rewired.edges.some((e) => e.source === "b" && e.target === "tool"),
        "Another Agent attachment survives",
    );
    assert.deepEqual(
        workflowPreviewGraph(rewired.nodes, rewired.edges).edges.find((e) => e.id === "new-wire")
            .targetHandle,
        targetHandle,
    );
    assert.deepEqual(
        normalizeWorkflowGraph(rewired.nodes, rewired.edges),
        rewired,
        "Save/reload preserves chosen handles",
    );
}
assert.equal(
    edgesBeforeConnection(nodes, graph.edges, { source: "branch", target: "end" }),
    graph.edges,
    "Control branches are not replaced",
);
console.log(
    "PASS: left and top targets remain distinct through connect, reconnect, save, reload and preview; latest reference wire wins without losing control branches.",
);

const actualNodes = nodes.map((n) =>
    n.id === "start" ? { ...n, data: { ...n.data, workflowMode: "actual" } } : n,
);
const oldAttachments = [
    {
        id: "tool-bottom",
        source: "a",
        sourceHandle: "tools",
        target: "tool",
        targetHandle: "attachment",
    },
    { id: "tool-child", source: "tool", sourceHandle: "children", target: "b" },
];
const actualGraph = normalizeWorkflowGraph(actualNodes, oldAttachments);
assert.equal(actualGraph.edges[0].targetHandle, "input");
assert.equal(actualGraph.edges[0].sourceHandle, "output");
assert.equal(actualGraph.edges[1].sourceHandle, "output");
assert.equal(
    normalizeWorkflowGraph(nodes, oldAttachments).edges[0].targetHandle,
    "attachment",
    "Super Agent top attachment stays unchanged",
);
assert.equal(
    normalizeWorkflowGraph(nodes, oldAttachments).edges[0].sourceHandle,
    "tools",
    "Super Agent bottom tool handle stays unchanged",
);
assert.equal(
    normalizeWorkflowGraph(nodes, oldAttachments).edges[1].sourceHandle,
    "children",
    "Super Agent child handle stays unchanged",
);
assert.deepEqual(normalizeWorkflowGraph(actualGraph.nodes, actualGraph.edges), actualGraph);
console.log(
    "PASS: Actual Agent legacy attachments move to left/right handles; Super Agent attachment handles are preserved.",
);

const superRight = normalizeWorkflowGraph(nodes, [{ id: "right", source: "a", target: "tool" }]);
assert.equal(
    superRight.edges[0].sourceHandle,
    "output",
    "An unnamed Agent output resolves to the right, never the first bottom handle",
);
assert.equal(superRight.edges[0].targetHandle, "input");
assert.deepEqual(normalizeWorkflowGraph(superRight.nodes, superRight.edges), superRight);
console.log(
    "PASS: legacy Super Agent right output is explicitly identified while model/memory/tools bottom outputs remain unchanged.",
);
