import type { WorkflowGraph, WorkflowNode } from "@/types/workflow";
import { InputError } from "./eassist/transport";
import { studioDependencies } from "./agent-studio-graph";

export const isActualAgent = (graph: WorkflowGraph) => graph.nodes.some(n => n.type === "StartNode" && n.data.workflowMode === "actual");
export function agentReferences(graph: WorkflowGraph) {
  if (!isActualAgent(graph)) return studioDependencies(graph).references;
  const reached=validateAgentFlow(graph);
  return [...new Map(graph.nodes.filter(n=>n.type==='AgentNode' && reached.has(n.id)).flatMap(n=>studioDependencies(graph,n.id).references).map(n=>[n.id,n])).values()];
}
const steps = new Set(["AgentNode", "ApiNode", "IfElseNode", "WhileNode", "UserApprovalNode", "EndNode"]);
export type FlowState = { id: string; output: string; steps: number; loops: Record<string, number> };
export function flowEdges(graph: WorkflowGraph, id: string) {
  return graph.edges.filter(e => e.source === id && !["model", "memory", "tools"].includes(e.sourceHandle || "") && steps.has(graph.nodes.find(n => n.id === e.target)?.type || ""));
}
// Only explicit comparisons are accepted; conditions never execute JavaScript or model guesses.
export function flowCondition(node: WorkflowNode, message: string, previous: string) {
  const operator = String(node.data.conditionOperator || "contains");
  const source = String(node.data.conditionSource || "previous");
  if (!["message", "previous"].includes(source) || !["contains", "equals", "not_contains"].includes(operator)) throw new InputError("Choose a supported condition source and comparison.", 422);
  const expected = String(node.data.ifCondition || "").trim().toLowerCase();
  if (!expected) throw new InputError("Enter the text to compare in If / Else settings.", 422);
  const value = (source === "message" ? message : previous).toLowerCase();
  return operator === "equals" ? value.trim() === expected : operator === "not_contains" ? !value.includes(expected) : value.includes(expected);
}
export function validateAgentFlow(graph: WorkflowGraph) {
  const start = graph.nodes.find(n => n.type === "StartNode");
  if (!start || flowEdges(graph, start.id).length !== 1) throw new InputError("Connect Start to exactly one first step.", 422);
  const visited = new Set<string>(), stack = new Set<string>();
  function visit(id: string) {
    if (stack.has(id)) {
      if (graph.nodes.find(n=>n.id===id)?.type === 'WhileNode') return;
      throw new InputError("This flow has a cycle outside a While step.", 422);
    }
    if (visited.has(id)) return;
    const node = graph.nodes.find(n => n.id === id);
    if (!node || (node.type !== "StartNode" && !steps.has(node.type || ""))) throw new InputError("This flow contains an unsupported step.", 422);
    stack.add(id);
    const raw = graph.edges.filter(e => e.source === id && !["model", "memory", "tools"].includes(e.sourceHandle || ""));
    if (raw.some(e => graph.nodes.find(n => n.id === e.target)?.type === 'StartNode')) throw new InputError("Steps cannot return to Start.", 422);
    const edges = flowEdges(graph, id);
    if (node.type === "IfElseNode") {
      flowCondition(node, "", "");
      if (edges.length !== 2 || edges.filter(e => e.sourceHandle === "if").length !== 1 || edges.filter(e => e.sourceHandle === "else").length !== 1) throw new InputError("Connect both If and Else outputs to one step each.", 422);
    } else if (node.type === 'WhileNode' || node.type === 'UserApprovalNode') {
      const handles=node.type==='WhileNode'?['body','done']:['approve','reject'];
      if(edges.length!==2 || handles.some(h=>edges.filter(e=>e.sourceHandle===h).length!==1) || edges.some(e=>e.target===id)) throw new InputError(`Connect both ${handles.join(' and ')} outputs to one step each.`,422);
      if(node.type==='WhileNode') {
        flowCondition({...node,data:{...node.data,ifCondition:node.data.condition}},'','');
        if(!Number.isInteger(node.data.maxIterations) || Number(node.data.maxIterations)<1 || Number(node.data.maxIterations)>20) throw new InputError('While requires a maximum of 1–20 iterations.',422);
      }
    } else if (edges.length > 1 || (node.type === "EndNode" && edges.length)) throw new InputError("Use If / Else to branch; each ordinary step has one next step.", 422);
    for (const edge of edges) visit(edge.target);
    stack.delete(id); visited.add(id);
  }
  visit(start.id);
  return visited;
}
export async function executeAgentFlow(graph: WorkflowGraph, message: string, execute: (node: WorkflowNode, previous: string, state: FlowState) => Promise<{ output: string; stop?: boolean }>, onBranch?: (node: WorkflowNode, branch: string) => void, resume?: FlowState) {
  validateAgentFlow(graph);
  let id = resume?.id ?? flowEdges(graph, graph.nodes.find(n => n.type === "StartNode")!.id)[0].target, output = resume?.output ?? message;
  const loops={...resume?.loops};
  for (let step = resume?.steps ?? 0; step < 24; step++) {
    const node = graph.nodes.find(n => n.id === id)!;
    const edges = flowEdges(graph, id);
    if (node.type === "EndNode") return String(node.data.message || output);
    if (node.type === "IfElseNode" || node.type === 'WhileNode') {
      const condition=node.type==='WhileNode'?{...node,data:{...node.data,ifCondition:node.data.condition}}:node;
      const matches=flowCondition(condition,message,output);
      const branch=node.type==='WhileNode'?(matches?'body':'done'):(matches?'if':'else');
      if(node.type==='WhileNode' && matches){loops[id]=(loops[id]||0)+1;if(loops[id]>Number(node.data.maxIterations)) throw new InputError('While reached its maximum iterations. Adjust the condition or workflow.',422);}
      onBranch?.(node, branch); id = edges.find(e => e.sourceHandle === branch)!.target; continue;
    }
    const result = await execute(node, output, {id,output,steps:step+1,loops:{...loops}}); output = result.output;
    if (result.stop || !edges.length) return output;
    id = edges[0].target;
  }
  throw new InputError("This flow exceeded its 24-step execution budget.", 422);
}
