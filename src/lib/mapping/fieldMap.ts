import mapping from './mappings.json';

/**
 * Return canonical field name given any synonym.
 * 
 * This function takes a field label and returns the standardized canonical
 * field name. If the label exists in our mappings, it returns the mapped
 * canonical name. Otherwise, it converts the label to lowercase with
 * underscores replacing spaces.
 * 
 * @param label - The input field label to normalize
 * @returns The canonical field name
 * 
 * @example
 * canonical('Firm Name') // returns 'firm_name'
 * canonical('Legal Name') // returns 'firm_name'
 * canonical('Some Unknown Field') // returns 'some_unknown_field'
 */
export function canonical(label: string): string {
  return (mapping as Record<string, string>)[label] ??
         label.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Get all available field mappings
 * 
 * @returns Record of all field mappings from input labels to canonical names
 */
export function getAllMappings(): Record<string, string> {
  return mapping as Record<string, string>;
}

/**
 * Check if a field label has a specific mapping
 * 
 * @param label - The field label to check
 * @returns True if the label has a mapping, false otherwise
 */
export function hasMapping(label: string): boolean {
  return label in (mapping as Record<string, string>);
}

/**
 * Get the reverse mapping (canonical name to original labels)
 * 
 * @returns Record mapping canonical names to arrays of original labels
 */
export function getReverseMappings(): Record<string, string[]> {
  const reverseMappings: Record<string, string[]> = {};
  const mappingRecord = mapping as Record<string, string>;
  
  for (const [originalLabel, canonicalName] of Object.entries(mappingRecord)) {
    if (!reverseMappings[canonicalName]) {
      reverseMappings[canonicalName] = [];
    }
    reverseMappings[canonicalName].push(originalLabel);
  }
  
  return reverseMappings;
} 