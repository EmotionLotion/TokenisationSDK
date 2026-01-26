/**
 * ActionStation - Dynamic action buttons based on asset template and user permissions
 *
 * The heart of generic interactivity:
 * - Reads available actions from asset template
 * - Checks user permissions + asset policies
 * - Renders enabled/disabled action buttons
 * - Handles action execution with policy evaluation
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Send,
  Download,
  Trash2,
  Clock,
  DollarSign,
  Lock,
  Unlock,
  XCircle,
  RotateCcw,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronDown,
} from 'lucide-react';
import type {
  ActionType,
  AssetInstance,
  AssetTemplate,
  ActionRequest,
  ActionResult,
  PolicyEvaluationResult,
} from '../types';
import { useAssetsOptional, useAssetActions } from '../context/AssetContext';
import { getActionLabel, getActionDescription } from '../templates/registry';

// ============================================
// Types
// ============================================

export interface ActionStationProps {
  /** Asset ID */
  assetId: string;
  /** Or pass asset directly */
  asset?: AssetInstance;
  /** Display variant */
  variant?: 'buttons' | 'dropdown' | 'full';
  /** Show descriptions */
  showDescriptions?: boolean;
  /** Show disabled actions */
  showDisabled?: boolean;
  /** Max visible actions (rest in dropdown) */
  maxVisible?: number;
  /** Callback before action (can prevent) */
  onBeforeAction?: (action: ActionType) => boolean | Promise<boolean>;
  /** Callback after action */
  onAfterAction?: (action: ActionType, result: ActionResult) => void;
  /** Custom action handlers */
  actionHandlers?: Partial<Record<ActionType, (asset: AssetInstance) => void | Promise<void>>>;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Action Icons
// ============================================

const actionIcons: Record<ActionType, React.ElementType> = {
  issue: DollarSign,
  transfer: Send,
  redeem: Download,
  retire: Trash2,
  expire: Clock,
  distribute: DollarSign,
  freeze: Lock,
  unfreeze: Unlock,
  revoke: XCircle,
  clawback: RotateCcw,
};

// ============================================
// Action Colors
// ============================================

const actionColors: Record<ActionType, { bg: string; text: string; hover: string }> = {
  issue: { bg: 'bg-green-500/20', text: 'text-green-400', hover: 'hover:bg-green-500/30' },
  transfer: { bg: 'bg-blue-500/20', text: 'text-blue-400', hover: 'hover:bg-blue-500/30' },
  redeem: { bg: 'bg-purple-500/20', text: 'text-purple-400', hover: 'hover:bg-purple-500/30' },
  retire: { bg: 'bg-red-500/20', text: 'text-red-400', hover: 'hover:bg-red-500/30' },
  expire: { bg: 'bg-orange-500/20', text: 'text-orange-400', hover: 'hover:bg-orange-500/30' },
  distribute: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', hover: 'hover:bg-emerald-500/30' },
  freeze: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', hover: 'hover:bg-cyan-500/30' },
  unfreeze: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', hover: 'hover:bg-cyan-500/30' },
  revoke: { bg: 'bg-red-500/20', text: 'text-red-400', hover: 'hover:bg-red-500/30' },
  clawback: { bg: 'bg-red-500/20', text: 'text-red-400', hover: 'hover:bg-red-500/30' },
};

// ============================================
// Action State
// ============================================

interface ActionState {
  action: ActionType;
  enabled: boolean;
  reason?: string;
  requirements?: string[];
}

// ============================================
// Single Action Button
// ============================================

interface ActionButtonProps {
  action: ActionType;
  state: ActionState;
  loading: boolean;
  showDescription: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick: () => void;
}

function ActionButton({
  action,
  state,
  loading,
  showDescription,
  size = 'md',
  onClick,
}: ActionButtonProps) {
  const Icon = actionIcons[action];
  const colors = actionColors[action];
  const label = getActionLabel(action);
  const description = getActionDescription(action);

  const sizeStyles = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!state.enabled || loading}
      title={state.reason || description}
      className={`
        inline-flex items-center gap-2 rounded-lg font-medium
        transition-all
        ${sizeStyles[size]}
        ${state.enabled
          ? `${colors.bg} ${colors.text} ${colors.hover}`
          : 'bg-white/5 text-gray-500 cursor-not-allowed'
        }
        disabled:opacity-50
      `}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Icon className="w-4 h-4" />
      )}
      <span>{label}</span>
      {showDescription && state.enabled && (
        <span className="text-xs opacity-70 ml-1">({description})</span>
      )}
    </button>
  );
}

// ============================================
// Dropdown Menu
// ============================================

interface ActionDropdownProps {
  actions: ActionState[];
  loadingAction: ActionType | null;
  onAction: (action: ActionType) => void;
}

function ActionDropdown({ actions, loadingAction, onAction }: ActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const enabledActions = actions.filter((a) => a.enabled);
  const disabledActions = actions.filter((a) => !a.enabled);

  if (actions.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg
          bg-white/5 text-white text-sm font-medium
          hover:bg-white/10 transition-colors"
      >
        <span>Actions</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 z-20 rounded-lg
            bg-gray-900 border border-white/10 shadow-xl overflow-hidden">
            {/* Enabled actions */}
            {enabledActions.map((state) => {
              const Icon = actionIcons[state.action];
              const colors = actionColors[state.action];
              const isLoading = loadingAction === state.action;

              return (
                <button
                  key={state.action}
                  type="button"
                  onClick={() => {
                    onAction(state.action);
                    setIsOpen(false);
                  }}
                  disabled={isLoading}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 text-left
                    hover:bg-white/5 transition-colors
                    ${isLoading ? 'opacity-50' : ''}
                  `}
                >
                  {isLoading ? (
                    <Loader2 className={`w-5 h-5 ${colors.text} animate-spin`} />
                  ) : (
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                  )}
                  <div>
                    <div className="text-white text-sm font-medium">
                      {getActionLabel(state.action)}
                    </div>
                    <div className="text-gray-500 text-xs">
                      {getActionDescription(state.action)}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Divider */}
            {enabledActions.length > 0 && disabledActions.length > 0 && (
              <div className="border-t border-white/10" />
            )}

            {/* Disabled actions */}
            {disabledActions.map((state) => {
              const Icon = actionIcons[state.action];

              return (
                <div
                  key={state.action}
                  className="flex items-center gap-3 px-4 py-3 opacity-50"
                  title={state.reason}
                >
                  <Icon className="w-5 h-5 text-gray-500" />
                  <div>
                    <div className="text-gray-500 text-sm font-medium">
                      {getActionLabel(state.action)}
                    </div>
                    {state.reason && (
                      <div className="text-gray-600 text-xs">{state.reason}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Full Action Panel
// ============================================

interface ActionPanelProps {
  actions: ActionState[];
  loadingAction: ActionType | null;
  onAction: (action: ActionType) => void;
}

function ActionPanel({ actions, loadingAction, onAction }: ActionPanelProps) {
  const enabledActions = actions.filter((a) => a.enabled);
  const disabledActions = actions.filter((a) => !a.enabled);

  return (
    <div className="space-y-4">
      {/* Enabled actions */}
      {enabledActions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Available Actions</h4>
          <div className="grid gap-2">
            {enabledActions.map((state) => {
              const Icon = actionIcons[state.action];
              const colors = actionColors[state.action];
              const isLoading = loadingAction === state.action;

              return (
                <button
                  key={state.action}
                  type="button"
                  onClick={() => onAction(state.action)}
                  disabled={isLoading}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left
                    ${colors.bg} ${colors.hover} transition-colors
                    ${isLoading ? 'opacity-50' : ''}
                  `}
                >
                  {isLoading ? (
                    <Loader2 className={`w-5 h-5 ${colors.text} animate-spin`} />
                  ) : (
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                  )}
                  <div className="flex-1">
                    <div className={`font-medium ${colors.text}`}>
                      {getActionLabel(state.action)}
                    </div>
                    <div className="text-gray-500 text-sm">
                      {getActionDescription(state.action)}
                    </div>
                  </div>
                  <CheckCircle className={`w-5 h-5 ${colors.text} opacity-50`} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Disabled actions */}
      {disabledActions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">Unavailable</h4>
          <div className="grid gap-2">
            {disabledActions.map((state) => {
              const Icon = actionIcons[state.action];

              return (
                <div
                  key={state.action}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg
                    bg-white/5 opacity-50"
                >
                  <Icon className="w-5 h-5 text-gray-500" />
                  <div className="flex-1">
                    <div className="text-gray-500 font-medium">
                      {getActionLabel(state.action)}
                    </div>
                    {state.reason && (
                      <div className="text-gray-600 text-sm">{state.reason}</div>
                    )}
                  </div>
                  <AlertCircle className="w-5 h-5 text-gray-600" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ActionStation({
  assetId,
  asset: propAsset,
  variant = 'buttons',
  showDescriptions = false,
  showDisabled = true,
  maxVisible = 3,
  onBeforeAction,
  onAfterAction,
  actionHandlers,
  className = '',
}: ActionStationProps) {
  const context = useAssetsOptional();
  const { availableActions, canPerformAction } = useAssetActions(assetId);

  const [loadingAction, setLoadingAction] = useState<ActionType | null>(null);
  const [actionStates, setActionStates] = useState<Record<ActionType, ActionState>>({} as Record<ActionType, ActionState>);

  // Get asset
  const asset = propAsset || context?.assets.find((a) => a.id === assetId);

  // Evaluate all actions on mount
  React.useEffect(() => {
    if (!asset || !context?.evaluateAction) return;

    availableActions.forEach(async (action) => {
      try {
        const result = await context.evaluateAction({
          action,
          assetId: asset.id,
          actorIdentityId: context.userIdentity?.id || '',
        });

        setActionStates((prev) => ({
          ...prev,
          [action]: {
            action,
            enabled: result.allowed,
            reason: result.reasons?.[0],
            requirements: result.requirements,
          },
        }));
      } catch {
        setActionStates((prev) => ({
          ...prev,
          [action]: {
            action,
            enabled: false,
            reason: 'Unable to evaluate',
          },
        }));
      }
    });
  }, [asset, availableActions, context]);

  // Handle action click
  const handleAction = useCallback(
    async (action: ActionType) => {
      if (!asset || loadingAction) return;

      // Check custom handler first
      if (actionHandlers?.[action]) {
        actionHandlers[action]!(asset);
        return;
      }

      // Before action callback
      if (onBeforeAction) {
        const shouldProceed = await onBeforeAction(action);
        if (!shouldProceed) return;
      }

      // Need context for executing actions
      if (!context?.executeAction) {
        console.warn('ActionStation: No AssetProvider found, cannot execute action');
        return;
      }

      setLoadingAction(action);

      try {
        const request: ActionRequest = {
          action,
          assetId: asset.id,
          actorId: context.userIdentity?.id || '',
          params: {},
        };

        const result = await context.executeAction(request);
        onAfterAction?.(action, result);
      } catch (error) {
        const result: ActionResult = {
          success: false,
          message: error instanceof Error ? error.message : 'Action failed',
        };
        onAfterAction?.(action, result);
      } finally {
        setLoadingAction(null);
      }
    },
    [asset, loadingAction, actionHandlers, onBeforeAction, context, onAfterAction]
  );

  // Build action states list
  const actionsList = useMemo(() => {
    return availableActions.map((action) => {
      return actionStates[action] || {
        action,
        enabled: canPerformAction(action),
      };
    });
  }, [availableActions, actionStates, canPerformAction]);

  // Filter visible vs overflow
  const visibleActions = showDisabled
    ? actionsList.slice(0, maxVisible)
    : actionsList.filter((a) => a.enabled).slice(0, maxVisible);

  const overflowActions = showDisabled
    ? actionsList.slice(maxVisible)
    : actionsList.filter((a) => a.enabled || showDisabled).slice(maxVisible);

  if (!asset || availableActions.length === 0) {
    return null;
  }

  // Full panel variant
  if (variant === 'full') {
    return (
      <div className={className}>
        <ActionPanel
          actions={actionsList}
          loadingAction={loadingAction}
          onAction={handleAction}
        />
      </div>
    );
  }

  // Dropdown variant
  if (variant === 'dropdown') {
    return (
      <div className={className}>
        <ActionDropdown
          actions={actionsList}
          loadingAction={loadingAction}
          onAction={handleAction}
        />
      </div>
    );
  }

  // Buttons variant (default)
  return (
    <div className={`flex items-center flex-wrap gap-2 ${className}`}>
      {visibleActions.map((state) => (
        <ActionButton
          key={state.action}
          action={state.action}
          state={state}
          loading={loadingAction === state.action}
          showDescription={showDescriptions}
          onClick={() => handleAction(state.action)}
        />
      ))}

      {overflowActions.length > 0 && (
        <ActionDropdown
          actions={overflowActions}
          loadingAction={loadingAction}
          onAction={handleAction}
        />
      )}
    </div>
  );
}

// ============================================
// Simplified Quick Actions
// ============================================

export interface QuickActionsProps {
  assetId: string;
  actions?: ActionType[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function QuickActions({
  assetId,
  actions = ['transfer', 'redeem'],
  size = 'md',
  className = '',
}: QuickActionsProps) {
  return (
    <ActionStation
      assetId={assetId}
      variant="buttons"
      showDisabled={false}
      maxVisible={actions.length}
      className={className}
    />
  );
}
