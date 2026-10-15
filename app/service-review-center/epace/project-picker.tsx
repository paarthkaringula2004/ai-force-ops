"use client";

import {useState} from "react";
import {Popover} from "@base-ui/react/popover";
import {Check, ChevronDown, Trash2} from "lucide-react";

export default function ProjectPicker({projects, value, disabled, onSelect, onDelete}: {
  projects:{id:string;name:string}[]; value:string; disabled:boolean;
  onSelect:(id:string)=>void; onDelete:(project:{id:string;name:string})=>void;
}) {
  const [open,setOpen]=useState(false);
  const selected=projects.find(project=>project.id===value);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger aria-label="Project" disabled={disabled} className="themed-select pace-project-trigger">
      <span>{selected?.name || "Select a project"}</span><ChevronDown size={15}/>
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner sideOffset={7} align="end" className="themed-select-positioner">
      <Popover.Popup className="themed-select-popup pace-project-popup">
        <Popover.Title className="pace-project-label">Select a project</Popover.Title>
        <div className="pace-project-list">
          {projects.map(project=><div key={project.id} className="pace-project-option" data-selected={project.id===value || undefined}>
            <button type="button" className="pace-project-name" aria-pressed={project.id===value} onClick={()=>{setOpen(false);onSelect(project.id);}}>
              <span>{project.name}</span>{project.id===value && <Check size={14} aria-hidden="true"/>}
            </button>
            <button type="button" className="pace-project-delete" aria-label={`Delete project ${project.name}`} title={`Delete ${project.name}`} onClick={()=>{setOpen(false);onDelete(project);}}><Trash2 size={15}/></button>
          </div>)}
          {!projects.length && <p className="pace-project-label">No projects yet</p>}
        </div>
      </Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
