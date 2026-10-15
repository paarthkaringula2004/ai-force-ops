// Action routing is deliberately separate from explanation/topic matching.
export function explicitReviewAction(input:string):'pause'|'resume'|'refresh'|'scan'|null {
 const text=input.trim().replace(/[.!]+$/,'').trim();
 if(/\?|\b(?:not|never|don't|dont|do not|if|whether|explain|what|why|how|would|could happen)\b/i.test(text))return null;
 const command=text.replace(/^(?:please\s+|can you\s+|could you\s+|i (?:want|need) you to\s+)/i,'').replace(/\s+please$/i,'');
 if(/^(?:pause|stop|disable) (?:the |our |project )?(?:(?:continuous|automatic|security|project) )?(?:monitoring|scanning|scans?)$/i.test(command))return 'pause';
 if(/^(?:enable|start|resume) (?:the |our |project )?(?:(?:continuous|automatic) )?(?:monitoring|scanning|scans?)$/i.test(command))return 'resume';
 if(/^(?:scan(?: now| project| my project| localhost)?|(?:start|initiate) (?:a |the )?(?:project |security )?scan)$/i.test(command))return 'scan';
 if(/^(?:reconnect|recheck|refresh|repair|recover)\s+(?:(?:the|my|our|all)\s+)?(?:[\w .:/-]+)$/i.test(command))return 'refresh';
 return null;
}
