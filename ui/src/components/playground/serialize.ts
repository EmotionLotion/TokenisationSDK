/**
 * Prop/state serialization utilities for generating JSX code snippets.
 * Converts runtime values into compilable TSX source strings.
 */

export function serializeValue(value: unknown, indent: number = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
    case 'boolean':
      return String(value);
    case 'bigint':
      return `BigInt("${value.toString()}")`;
    case 'function':
      return `() => { /* ${(value as Function).name || 'anonymous'} */ }`;
    case 'object': {
      if (value instanceof Date) {
        return `new Date("${value.toISOString()}")`;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const pad = '  '.repeat(indent + 1);
        const closePad = '  '.repeat(indent);
        const items = value.map(v => `${pad}${serializeValue(v, indent + 1)}`).join(',\n');
        return `[\n${items}\n${closePad}]`;
      }
      // Plain object
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return '{}';
      const pad = '  '.repeat(indent + 1);
      const closePad = '  '.repeat(indent);
      const props = entries
        .map(([k, v]) => `${pad}${k}: ${serializeValue(v, indent + 1)}`)
        .join(',\n');
      return `{\n${props}\n${closePad}}`;
    }
    default:
      return String(value);
  }
}

/**
 * Convert a props object into JSX attribute strings.
 *
 * @example
 * propsToTsx({ name: "Hello", count: 3, active: true })
 * // => 'name="Hello" count={3} active'
 */
export function propsToTsx(props: Record<string, unknown>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => {
      if (typeof value === 'boolean') {
        return value ? key : `${key}={false}`;
      }
      if (typeof value === 'string') {
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}={${serializeValue(value)}}`;
    })
    .join(' ');
}

/**
 * Generate a useState declaration for a given state variable.
 *
 * @example
 * stateToTsx('count', 42)
 * // => 'const [count, setCount] = useState(42);'
 */
export function stateToTsx(name: string, value: unknown): string {
  const setter = `set${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  return `const [${name}, ${setter}] = useState(${serializeValue(value)});`;
}
