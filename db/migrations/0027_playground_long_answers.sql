-- Retain full generated answers while keeping user questions bounded.
ALTER TABLE playground_messages DROP CONSTRAINT playground_messages_content_check;
ALTER TABLE playground_messages ADD CONSTRAINT playground_messages_content_check
CHECK (length(content) BETWEEN 1 AND CASE WHEN role = 'assistant' THEN 60000 ELSE 12000 END);
