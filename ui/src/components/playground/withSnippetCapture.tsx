import React, { useEffect, useRef, useImperativeHandle, forwardRef, ComponentType } from 'react';
import { propsToTsx } from './serialize';

export interface SnippetHandle {
  getSnippet(): string;
}

interface SnippetCaptureOptions {
  /** Display name used in the generated import/JSX */
  displayName?: string;
  /** Package the component is imported from */
  importFrom?: string;
}

/**
 * Higher-order component that wraps any component and captures its props
 * for code snippet generation.
 *
 * @example
 * const MyCardWithSnippet = withSnippetCapture(MyCard, {
 *   displayName: 'MyCard',
 *   importFrom: '@tokenisation/ui-kit',
 * });
 *
 * // In parent:
 * const ref = useRef<SnippetHandle>(null);
 * <MyCardWithSnippet ref={ref} title="Hello" />
 * ref.current?.getSnippet();
 * // => `import { MyCard } from '@tokenisation/ui-kit';\n\n<MyCard title="Hello" />`
 */
export function withSnippetCapture<P extends Record<string, any>>(
  WrappedComponent: ComponentType<P>,
  options: SnippetCaptureOptions = {},
) {
  const name = options.displayName || WrappedComponent.displayName || WrappedComponent.name || 'Component';
  const importPath = options.importFrom || '@tokenisation/ui-kit';

  const WithSnippet = forwardRef<SnippetHandle, P>((props, ref) => {
    const capturedProps = useRef<Record<string, unknown>>({});

    useEffect(() => {
      capturedProps.current = { ...props } as Record<string, unknown>;
    }, [props]);

    useImperativeHandle(ref, () => ({
      getSnippet(): string {
        const attrs = propsToTsx(capturedProps.current);
        const importLine = `import { ${name} } from '${importPath}';`;
        const jsx = attrs ? `<${name} ${attrs} />` : `<${name} />`;
        return `${importLine}\n\n${jsx}`;
      },
    }));

    return <WrappedComponent {...props as any} />;
  });

  WithSnippet.displayName = `WithSnippetCapture(${name})`;
  return WithSnippet;
}
