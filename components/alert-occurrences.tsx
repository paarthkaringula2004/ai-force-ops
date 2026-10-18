export function AlertOccurrences({ times, sources = [] }: { times: string[]; sources?: string[] }) {
    if (times.length < 2 && sources.length < 2) return null;
    return (
        <div className="my-3 text-xs text-slate-500">
            <ol className="space-y-1">
                {times.slice(0, 3).map((time, index) => (
                    <li key={`${time}:${index}`}><time dateTime={time}>{new Date(time).toLocaleString()}</time></li>
                ))}
            </ol>
            <details className="mt-2">
                <summary className="cursor-pointer font-medium text-indigo-600">
                    {times.length} occurrences · latest first
                </summary>
                {times.length > 3 && <ol className="mt-2 max-h-48 space-y-1 overflow-auto">
                    {times.slice(3).map((time, index) => (
                        <li key={`${time}:${index}`}><time dateTime={time}>{new Date(time).toLocaleString()}</time></li>
                    ))}
                </ol>}
                {sources.length > 0 && <p className="mt-2">Sources: {sources.join("; ")}</p>}
            </details>
        </div>
    );
}
