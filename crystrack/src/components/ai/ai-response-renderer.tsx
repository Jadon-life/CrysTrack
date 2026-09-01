'use client';

function cleanAIResponse(text: string) {
  return text
    // Remove markdown headings
    .replace(/^#{1,6}\s+/gm, '')

    // Remove bold markers
    .replace(/\*\*(.*?)\*\*/g, '$1')

    // Remove italic markers
    .replace(/\*(.*?)\*/g, '$1')

    // Convert HTML breaks
    .replace(/<br\s*\/?>/gi, '\n')

    // Convert markdown links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    // Remove markdown table separator rows
    .replace(/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/gm, '')

    // Convert table rows into readable lines
    .replace(/^\s*\|(.+)\|\s*$/gm, (_, row) => {
      return row
        .split('|')
        .map((cell: string) => cell.trim())
        .filter(Boolean)
        .join(' • ');
    })

    // Remove repeated empty lines
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
