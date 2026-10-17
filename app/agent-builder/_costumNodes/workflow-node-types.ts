import type { NodeTypes } from "@xyflow/react";
import StudioNode, { ActualStudioNode } from "./StudioNode";
import AgentNode from "./AgentNode";
import ApiNode from "./ApiNode";
import EndNode from "./EndNode";
import IfElseNode from "./IfElseNode";
import StartNode from "./StartNode";
import UserApprovalNode from "./UserApprovalNode";
import WhileNode from "./WhileNode";
import { actualNodeTypes } from "./ActualNodes";
const studio: NodeTypes = {
    ModelNode: StudioNode,
    MemoryNode: StudioNode,
    ToolsNode: StudioNode,
    AgentsNode: StudioNode,
    ReferenceNode: StudioNode,
    StartNode,
    AgentNode,
    ApiNode,
    EndNode,
    IfElseNode,
    WhileNode,
    UserApprovalNode,
};
const actual: NodeTypes = {
    ...studio,
    ...actualNodeTypes,
    ModelNode: ActualStudioNode,
    MemoryNode: ActualStudioNode,
    ToolsNode: ActualStudioNode,
    AgentsNode: ActualStudioNode,
    ReferenceNode: ActualStudioNode,
};
export function workflowNodeTypes(isActual: boolean) {
    return isActual ? actual : studio;
}
