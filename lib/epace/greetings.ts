// Match only a standalone greeting. A greeting followed by a project question
// must still go through retrieval and the document evidence requirement.
export function isStandaloneGreeting(input: string): boolean {
  const plain = input.trim().replace(/^[*_]+|[*_]+$/g, "").trim();
  return /^(?:hi|hello|hey|hiya|greetings|good morning|good afternoon|good evening)(?: there| epace| assistant| aiforce(?:\.ops)?| chatbot)?[!.\s]*$/i.test(plain);
}
