// tests/stream/formatSSE.test.ts

/**
 * Helper function to format SSE tokens
 * @param token The token to format
 * @returns Formatted SSE string
 */
export function formatSSEToken(token: string): string {
  // Escape the token properly for JSON
  const escapedToken = JSON.stringify(token);
  return `data: {"token":${escapedToken}}\n\n`;
}

/**
 * Helper function to format SSE data messages
 * @param data The data to format
 * @returns Formatted SSE string
 */
export function formatSSEData(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Format the completion marker
 */
export function formatSSEDone(): string {
  return 'data: [DONE]\n\n';
}

/**
 * Format an SSE event
 */
export function formatSSEEvent(event: string, data?: string): string {
  if (data) {
    return `event: ${event}\ndata: ${data}\n\n`;
  }
  return `event: ${event}\n\n`;
}

describe('SSE Token Formatting', () => {
  describe('formatSSEToken', () => {
    it('should format a simple token correctly', () => {
      const token = 'Hello';
      const result = formatSSEToken(token);
      expect(result).toBe('data: {"token":"Hello"}\n\n');
    });

    it('should properly escape special characters in tokens', () => {
      const token = 'Hello\n"World"';
      const result = formatSSEToken(token);
      expect(result).toBe('data: {"token":"Hello\\n\\"World\\""}\n\n');
    });

    it('should handle empty tokens', () => {
      const token = '';
      const result = formatSSEToken(token);
      expect(result).toBe('data: {"token":""}\n\n');
    });

    it('should always end with two newlines for SSE format', () => {
      const token = 'test';
      const result = formatSSEToken(token);
      expect(result.endsWith('\n\n')).toBe(true);
    });
  });

  describe('formatSSEData', () => {
    it('should format connection message correctly', () => {
      const data = { type: 'connected' };
      const result = formatSSEData(data);
      expect(result).toBe('data: {"type":"connected"}\n\n');
    });

    it('should format error data correctly', () => {
      const data = { error: 'Something went wrong', code: 'ERROR_001' };
      const result = formatSSEData(data);
      expect(result).toBe('data: {"error":"Something went wrong","code":"ERROR_001"}\n\n');
    });
  });

  describe('formatSSEDone', () => {
    it('should format the completion marker correctly', () => {
      const result = formatSSEDone();
      expect(result).toBe('data: [DONE]\n\n');
    });
  });

  describe('formatSSEEvent', () => {
    it('should format an event with data', () => {
      const result = formatSSEEvent('error', 'Connection failed');
      expect(result).toBe('event: error\ndata: Connection failed\n\n');
    });

    it('should format an event without data', () => {
      const result = formatSSEEvent('end');
      expect(result).toBe('event: end\n\n');
    });
  });

  describe('SSE Stream Protocol', () => {
    it('should follow correct SSE message sequence', () => {
      const messages: string[] = [];
      
      // Connection established
      messages.push(formatSSEData({ type: 'connected' }));
      
      // Stream tokens
      messages.push(formatSSEToken('Hello'));
      messages.push(formatSSEToken(' world'));
      messages.push(formatSSEToken('!'));
      
      // Complete stream
      messages.push(formatSSEDone());
      messages.push(formatSSEEvent('end'));
      
      // Verify format
      const stream = messages.join('');
      expect(stream).toContain('data: {"type":"connected"}');
      expect(stream).toContain('data: {"token":"Hello"}');
      expect(stream).toContain('data: [DONE]');
      expect(stream).toContain('event: end');
      
      // Each message should be separated by double newlines
      messages.forEach(msg => {
        expect(msg.endsWith('\n\n')).toBe(true);
      });
    });
  });
});
