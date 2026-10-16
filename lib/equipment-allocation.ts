export type EquipmentAllocation='Replacement'|'Upgrade'|'New allocation';
export function damagedEquipment(input:string){
 const text=input.toLowerCase().replace(/[’‘]/g,"'");
 if(/\b(?:not|never|isn't|isnt|is not|wasn't|wasnt)\s+(?:\w+\s+){0,2}(?:broken|damaged|crushed|faulty)\b/.test(text))return false;
 return /\b(?:broken|damaged|crushed|faulty|beyond repair|(?:can't|cant|cannot|can not) be repaired|not working|stopped working)\b/.test(text);
}
export function equipmentAllocation(input:string):EquipmentAllocation|null{
 const text=input.toLowerCase().replace(/[’‘]/g,"'");
 if(/^(?:what|why|explain|difference|which|how)\b/.test(text)||/\b(?:or|versus|vs)\b/.test(text))return null;
 if(/\b(?:not|don't|dont|do not|no)\s+(?:(?:want|need)\s+)?(?:(?:a|an)\s+)?(?:replacement|upgrade|new allocation)\b/.test(text))return null;
 const explicit=[/\breplac(?:ement|e|ing)\b/.test(text)?'Replacement':null,/\bupgrad(?:e|ing)\b/.test(text)?'Upgrade':null,/\bnew allocation\b|\b(?:first|initial)\s+(?:company\s+|work\s+)?laptop\b/.test(text)?'New allocation':null].filter(Boolean) as EquipmentAllocation[];
 if(explicit.length>1)return null;
 if(explicit.length===1)return explicit[0];
 return damagedEquipment(input)?'Replacement':null;
}
