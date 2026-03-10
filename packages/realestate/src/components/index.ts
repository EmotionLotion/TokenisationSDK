/**
 * Real Estate Components
 *
 * Pre-built UI components for real estate tokenization applications:
 * - Property mapping and visualization
 * - Unit management
 * - Maintenance tracking
 * - Expense management
 * - Occupancy dashboards
 */

export { PropertyMap, type PropertyMapProps } from './PropertyMap.js';
export { NavHistoryChart, type NavHistoryChartProps, type NavDataPoint } from './NavHistoryChart.js';
export {
  UnitList,
  type UnitListProps,
  type PropertyUnit as UnitListPropertyUnit,
  type UnitType as UnitListUnitType,
  type UnitStatus as UnitListUnitStatus,
} from './UnitList.js';
export {
  UnitForm,
  type UnitFormProps,
  type UnitFormData,
  type UnitType as UnitFormUnitType,
  type UnitStatus as UnitFormUnitStatus,
} from './UnitForm.js';
export {
  MaintenanceList,
  type MaintenanceListProps,
  type MaintenanceRequest as MaintenanceListRequest,
  type MaintenancePriority as MaintenanceListPriority,
  type MaintenanceStatus as MaintenanceListStatus,
} from './MaintenanceList.js';
export {
  MaintenanceForm,
  type MaintenanceFormProps,
  type MaintenanceFormData,
  type UnitOption,
  type MaintenancePriority as MaintenanceFormPriority,
} from './MaintenanceForm.js';
export {
  ExpenseTracker,
  type ExpenseTrackerProps,
  type PropertyExpense as ExpenseTrackerExpense,
  type RecordExpenseData,
  type ExpenseCategory,
} from './ExpenseTracker.js';
export {
  OccupancyDashboard,
  type OccupancyDashboardProps,
  type PropertySummary as OccupancyPropertySummary,
} from './OccupancyDashboard.js';
