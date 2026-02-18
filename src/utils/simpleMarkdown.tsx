import React from 'react';
import { Text, TextStyle } from 'react-native';

/**
 * Lightweight markdown→RN Text renderer for chat messages.
 * Supports: **bold**, *italic*, `code`, - list items, newlines.
 */
export function renderMarkdown(
  text: string,
  baseStyle?: TextStyle,
  boldColor?: string,
): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) nodes.push('\n');

    // List items: "- text" or "* text" at line start
    const listMatch = line.match(/^(\s*[-*]\s+)(.*)/);
    const content = listMatch ? listMatch[2] : line;
    if (listMatch) nodes.push(listMatch[1]);

    // Inline formatting: **bold**, *italic*, `code`
    const parts = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    parts.forEach((part, partIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        nodes.push(
          <Text key={`${lineIdx}-${partIdx}`} style={{ fontWeight: '700', color: boldColor }}>
            {part.slice(2, -2)}
          </Text>,
        );
      } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        nodes.push(
          <Text key={`${lineIdx}-${partIdx}`} style={{ fontStyle: 'italic' }}>
            {part.slice(1, -1)}
          </Text>,
        );
      } else if (part.startsWith('`') && part.endsWith('`')) {
        nodes.push(
          <Text
            key={`${lineIdx}-${partIdx}`}
            style={{ fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.06)', fontSize: 13 }}
          >
            {part.slice(1, -1)}
          </Text>,
        );
      } else {
        nodes.push(part);
      }
    });
  });

  return <Text style={baseStyle}>{nodes}</Text>;
}
