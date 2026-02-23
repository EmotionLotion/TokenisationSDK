/**
 * Embed Widget
 *
 * Embeddable investment widget for partner integration.
 * Partners can include a simple script tag to add investment functionality
 * to their websites.
 *
 * @example Browser usage (script tag)
 * ```html
 * <script
 *   src="https://cdn.tokenisation.io/embed.js"
 *   data-publishable-key="pk_test_xxx"
 * ></script>
 *
 * <script>
 *   // Open investment widget
 *   Tokenisation.open({
 *     assetId: 'ast_123',
 *     mode: 'invest',
 *     theme: 'light',
 *   }, {
 *     onInvest: (result) => {
 *       console.log('Investment completed:', result);
 *     }
 *   });
 * </script>
 * ```
 *
 * @example Programmatic usage
 * ```typescript
 * import { createEmbed } from '@tokenisation/sdk/embed';
 *
 * const embed = createEmbed();
 *
 * embed.init({ publishableKey: 'pk_test_xxx' });
 *
 * embed.open({
 *   assetId: 'ast_123',
 *   mode: 'invest',
 * });
 * ```
 */

// Types
export * from './types.js';

// Loader (for script tag usage)
export { createEmbed, autoInit } from './loader.js';

// React components (for custom implementations)
export {
  EmbedWidget,
  EmbedApp,
  EmbedWidgetProvider,
  useEmbedContext,
} from './EmbedWidget.js';
