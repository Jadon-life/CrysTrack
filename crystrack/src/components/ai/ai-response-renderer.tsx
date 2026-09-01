'use client';

function cleanAIResponse(text: string) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n');
}

export function AIResponseRenderer({
  content,
}: {
  content: string;
}) {
  const cleaned = cleanAIResponse(content);

  return (
    <div className="ai-response">
      {cleaned.split('\n').map((line, index) => (
        <p key={index}>
          {line}
        </p>
      ))}
    </div>
  );
}
